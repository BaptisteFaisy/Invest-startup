const crypto = require('crypto');

const ENVELOPE_MARKER = 'liquidplus.document.v1';
const ALGORITHM = 'aes-256-gcm';

const DEFAULT_FIELDS = Object.freeze({
  saas_documents: Object.freeze({ data: 'binary', html: 'utf8', extracted_text: 'utf8' }),
  saas_doc_versions: Object.freeze({ html: 'utf8' }),
  saas_avocat_requests: Object.freeze({ note: 'utf8' }),
  saas_avocat_messages: Object.freeze({ body: 'utf8', secure_share_url: 'utf8' }),
  saas_company_verification_documents: Object.freeze({ data: 'binary' }),
  saas_avocat_appointments: Object.freeze({ join_url: 'utf8' }),
  lawyer_payment_requests: Object.freeze({ description: 'utf8', fee_agreement_reference: 'utf8' }),
});

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  // Le driver MongoDB renvoie les BSON Binary avec un buffer interne.
  if (value && value.buffer != null) return asBuffer(value.buffer);
  throw new TypeError('Valeur binaire de document invalide');
}

function isEncryptedEnvelope(value) {
  return !!value && typeof value === 'object' && value.marker === ENVELOPE_MARKER;
}

function createDocumentEncryption(masterSecret, fieldsByCollection = DEFAULT_FIELDS) {
  if (typeof masterSecret !== 'string' || masterSecret.length < 32) {
    throw new Error('La clé de chiffrement des documents doit contenir au moins 32 caractères');
  }

  // Dérivation dédiée : les documents et les autres secrets applicatifs n'utilisent
  // pas directement la même clé cryptographique, même si ENCRYPTION_KEY est la
  // racine commune configurée sur le serveur.
  const key = crypto.createHmac('sha256', Buffer.from(masterSecret, 'utf8'))
    .update('liquidplus:documents:aes-256-gcm:v1')
    .digest();

  function aad(collectionName, fieldName, encoding) {
    return Buffer.from(`${ENVELOPE_MARKER}:${collectionName}:${fieldName}:${encoding}`, 'utf8');
  }

  function encryptValue(collectionName, fieldName, encoding, value) {
    if (isEncryptedEnvelope(value)) return value;
    const plain = encoding === 'binary' ? asBuffer(value) : Buffer.from(String(value), 'utf8');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(aad(collectionName, fieldName, encoding));
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return {
      marker: ENVELOPE_MARKER,
      algorithm: ALGORITHM,
      encoding,
      iv,
      tag: cipher.getAuthTag(),
      ciphertext,
    };
  }

  function decryptValue(collectionName, fieldName, value) {
    if (!isEncryptedEnvelope(value)) return value; // lecture rétrocompatible avant migration
    if (value.algorithm !== ALGORITHM || !['binary', 'utf8'].includes(value.encoding)) {
      throw new Error(`Enveloppe chiffrée invalide (${collectionName}.${fieldName})`);
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, key, asBuffer(value.iv));
    decipher.setAAD(aad(collectionName, fieldName, value.encoding));
    decipher.setAuthTag(asBuffer(value.tag));
    const plain = Buffer.concat([decipher.update(asBuffer(value.ciphertext)), decipher.final()]);
    return value.encoding === 'binary' ? plain : plain.toString('utf8');
  }

  function encryptDocument(collectionName, document) {
    if (!document || typeof document !== 'object') return document;
    const fields = fieldsByCollection[collectionName];
    if (!fields) return document;
    const protectedDocument = { ...document };
    for (const [fieldName, encoding] of Object.entries(fields)) {
      if (Object.prototype.hasOwnProperty.call(protectedDocument, fieldName)) {
        if (protectedDocument[fieldName] == null) continue;
        protectedDocument[fieldName] = encryptValue(
          collectionName, fieldName, encoding, protectedDocument[fieldName],
        );
      }
    }
    return protectedDocument;
  }

  function decryptDocument(collectionName, document) {
    if (!document || typeof document !== 'object') return document;
    const fields = fieldsByCollection[collectionName];
    if (!fields) return document;
    const clearDocument = { ...document };
    for (const fieldName of Object.keys(fields)) {
      if (Object.prototype.hasOwnProperty.call(clearDocument, fieldName)) {
        clearDocument[fieldName] = decryptValue(collectionName, fieldName, clearDocument[fieldName]);
      }
    }
    return clearDocument;
  }

  function encryptUpdate(collectionName, update) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return update;
    const hasOperators = Object.keys(update).some(keyName => keyName.startsWith('$'));
    if (!hasOperators) return encryptDocument(collectionName, update);

    const protectedUpdate = { ...update };
    for (const operator of ['$set', '$setOnInsert']) {
      if (!update[operator] || typeof update[operator] !== 'object') continue;
      protectedUpdate[operator] = encryptDocument(collectionName, update[operator]);
    }
    return protectedUpdate;
  }

  function wrapCursor(collectionName, cursor) {
    return new Proxy(cursor, {
      get(target, property) {
        if (property === 'toArray') {
          return async () => (await target.toArray()).map(doc => decryptDocument(collectionName, doc));
        }
        if (property === 'next' || property === 'tryNext') {
          return async (...args) => decryptDocument(collectionName, await target[property](...args));
        }
        if (property === Symbol.asyncIterator) {
          return async function* decryptedIterator() {
            for await (const doc of target) yield decryptDocument(collectionName, doc);
          };
        }
        const member = target[property];
        if (typeof member !== 'function') return member;
        return (...args) => {
          const result = member.apply(target, args);
          if (result && typeof result.toArray === 'function') return wrapCursor(collectionName, result);
          return result;
        };
      },
    });
  }

  function wrapCollection(collectionName, collection) {
    if (!fieldsByCollection[collectionName]) return collection;
    return new Proxy(collection, {
      get(target, property) {
        if (property === 'insertOne') {
          return (document, options) => target.insertOne(encryptDocument(collectionName, document), options);
        }
        if (property === 'insertMany') {
          return (documents, options) => target.insertMany(
            documents.map(document => encryptDocument(collectionName, document)), options,
          );
        }
        if (property === 'replaceOne') {
          return (filter, replacement, options) => target.replaceOne(
            filter, encryptDocument(collectionName, replacement), options,
          );
        }
        if (property === 'updateOne' || property === 'updateMany') {
          return (filter, update, options) => target[property](
            filter, encryptUpdate(collectionName, update), options,
          );
        }
        if (property === 'findOneAndUpdate') {
          return async (filter, update, options) => decryptDocument(
            collectionName,
            await target.findOneAndUpdate(filter, encryptUpdate(collectionName, update), options),
          );
        }
        if (property === 'findOneAndReplace') {
          return async (filter, replacement, options) => decryptDocument(
            collectionName,
            await target.findOneAndReplace(
              filter, encryptDocument(collectionName, replacement), options,
            ),
          );
        }
        if (property === 'bulkWrite') {
          return (operations, options) => target.bulkWrite(operations.map(operation => {
            if (operation.insertOne) return { insertOne: {
              ...operation.insertOne,
              document: encryptDocument(collectionName, operation.insertOne.document),
            } };
            if (operation.updateOne || operation.updateMany) {
              const kind = operation.updateOne ? 'updateOne' : 'updateMany';
              return { [kind]: {
                ...operation[kind],
                update: encryptUpdate(collectionName, operation[kind].update),
              } };
            }
            if (operation.replaceOne) return { replaceOne: {
              ...operation.replaceOne,
              replacement: encryptDocument(collectionName, operation.replaceOne.replacement),
            } };
            return operation;
          }), options);
        }
        if (property === 'findOne') {
          return async (...args) => decryptDocument(collectionName, await target.findOne(...args));
        }
        if (property === 'find') {
          return (...args) => wrapCursor(collectionName, target.find(...args));
        }
        if (property === 'aggregate') {
          return (...args) => wrapCursor(collectionName, target.aggregate(...args));
        }
        const member = target[property];
        return typeof member === 'function' ? member.bind(target) : member;
      },
    });
  }

  async function migrateCollection(database, collectionName) {
    const fields = fieldsByCollection[collectionName];
    const collection = database.collection(collectionName);
    // Certains environnements de test ou déploiements progressifs n'exposent pas
    // encore toutes les collections facultatives.
    if (!collection) return null;
    // Échoue immédiatement au démarrage si la clé configurée ne permet pas de
    // déchiffrer les données déjà présentes, plutôt que de servir des erreurs
    // tardives au premier utilisateur qui ouvre un document.
    for (const fieldName of Object.keys(fields)) {
      const sample = await collection.findOne(
        { [`${fieldName}.marker`]: ENVELOPE_MARKER },
        { projection: { [fieldName]: 1 } },
      );
      if (sample && sample[fieldName]) decryptValue(collectionName, fieldName, sample[fieldName]);
    }
    const projection = { _id: 1 };
    Object.keys(fields).forEach(fieldName => { projection[fieldName] = 1; });
    const cursor = collection.find(
      { $or: Object.keys(fields).map(fieldName => ({
        [fieldName]: { $exists: true, $ne: null },
        [`${fieldName}.marker`]: { $ne: ENVELOPE_MARKER },
      })) },
      { projection },
    ).batchSize(20);
    const operations = [];
    let migrated = 0;

    for await (const document of cursor) {
      const set = {};
      for (const [fieldName, encoding] of Object.entries(fields)) {
        if (Object.prototype.hasOwnProperty.call(document, fieldName)
          && document[fieldName] != null
          && !isEncryptedEnvelope(document[fieldName])) {
          set[fieldName] = encryptValue(collectionName, fieldName, encoding, document[fieldName]);
        }
      }
      if (!Object.keys(set).length) continue;
      operations.push({ updateOne: { filter: { _id: document._id }, update: { $set: set } } });
      migrated += 1;
      if (operations.length === 20) {
        await collection.bulkWrite(operations, { ordered: true });
        operations.length = 0;
      }
    }
    if (operations.length) await collection.bulkWrite(operations, { ordered: true });
    return migrated;
  }

  async function migrateExistingDocuments(database) {
    const result = {};
    for (const collectionName of Object.keys(fieldsByCollection)) {
      const migrated = await migrateCollection(database, collectionName);
      if (migrated != null) result[collectionName] = migrated;
    }
    return result;
  }

  return {
    decryptDocument,
    encryptDocument,
    encryptUpdate,
    migrateExistingDocuments,
    wrapCollection,
  };
}

module.exports = {
  DEFAULT_FIELDS,
  ENVELOPE_MARKER,
  createDocumentEncryption,
  isEncryptedEnvelope,
};
