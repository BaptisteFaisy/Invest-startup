const assert = require('node:assert/strict');
const test = require('node:test');

const { createDocumentEncryption, isEncryptedEnvelope } = require('../lib/document-encryption');

const encryption = createDocumentEncryption('test-key-that-is-deliberately-longer-than-32-characters');

test('chiffre et déchiffre les fichiers binaires sans altération', () => {
  const clear = Buffer.from([0, 1, 2, 3, 254, 255]);
  const stored = encryption.encryptDocument('saas_documents', { id: 1, data: clear });

  assert.equal(isEncryptedEnvelope(stored.data), true);
  assert.equal(stored.data.ciphertext.equals(clear), false);
  assert.deepEqual(encryption.decryptDocument('saas_documents', stored).data, clear);
});

test('chiffre tous les contenus textuels des documents et de leurs versions', () => {
  const document = encryption.encryptDocument('saas_documents', {
    html: '<p>Clause confidentielle</p>',
    extracted_text: 'Contenu juridique confidentiel',
  });
  const version = encryption.encryptDocument('saas_doc_versions', {
    html: '<p>Version validée</p>',
  });

  assert.equal(isEncryptedEnvelope(document.html), true);
  assert.equal(isEncryptedEnvelope(document.extracted_text), true);
  assert.equal(isEncryptedEnvelope(version.html), true);
  assert.equal(encryption.decryptDocument('saas_documents', document).html, '<p>Clause confidentielle</p>');
  assert.equal(encryption.decryptDocument('saas_documents', document).extracted_text, 'Contenu juridique confidentiel');
  assert.equal(encryption.decryptDocument('saas_doc_versions', version).html, '<p>Version validée</p>');
});

test('chiffre les champs sensibles des mises à jour MongoDB', () => {
  const update = encryption.encryptUpdate('saas_documents', {
    $set: { html: '<p>Nouveau texte</p>', name: 'Pacte' },
    $unset: { extracted_text: '' },
  });

  assert.equal(isEncryptedEnvelope(update.$set.html), true);
  assert.equal(update.$set.name, 'Pacte');
  assert.deepEqual(update.$unset, { extracted_text: '' });
});

test('refuse le déchiffrement si le contenu chiffré a été modifié', () => {
  const stored = encryption.encryptDocument('saas_documents', { html: '<p>Secret</p>' });
  stored.html.ciphertext[0] ^= 1;

  assert.throws(
    () => encryption.decryptDocument('saas_documents', stored),
    /authenticate data|Unsupported state/i,
  );
});

test('la collection protégée chiffre les écritures et déchiffre les lectures', async () => {
  let stored;
  const rawCollection = {
    async insertOne(document) { stored = document; return { acknowledged: true }; },
    async findOne() { return stored; },
  };
  const collection = encryption.wrapCollection('saas_documents', rawCollection);

  await collection.insertOne({ id: 7, html: '<p>Confidentiel</p>' });
  assert.equal(isEncryptedEnvelope(stored.html), true);
  assert.equal((await collection.findOne({ id: 7 })).html, '<p>Confidentiel</p>');
});

test('la migration chiffre les documents historiques encore en clair', async () => {
  class FakeCursor {
    constructor(documents) { this.documents = documents; }
    batchSize() { return this; }
    async *[Symbol.asyncIterator]() {
      for (const document of this.documents) yield document;
    }
  }
  class FakeCollection {
    constructor(documents) { this.documents = documents; }
    async findOne() { return null; }
    find() { return new FakeCursor(this.documents); }
    async bulkWrite(operations) {
      for (const { updateOne } of operations) {
        const document = this.documents.find(item => item._id === updateOne.filter._id);
        Object.assign(document, updateOne.update.$set);
      }
    }
  }
  const collections = {
    saas_documents: new FakeCollection([
      { _id: 'doc-1', data: Buffer.from('ancien fichier'), html: '<p>Ancien</p>' },
    ]),
    saas_doc_versions: new FakeCollection([
      { _id: 'version-1', html: '<p>Ancienne version</p>' },
    ]),
  };
  const database = { collection: name => collections[name] };

  const migrated = await encryption.migrateExistingDocuments(database);
  assert.deepEqual(migrated, { saas_documents: 1, saas_doc_versions: 1 });
  assert.equal(isEncryptedEnvelope(collections.saas_documents.documents[0].data), true);
  assert.equal(isEncryptedEnvelope(collections.saas_documents.documents[0].html), true);
  assert.equal(isEncryptedEnvelope(collections.saas_doc_versions.documents[0].html), true);
});

test('le démarrage échoue si la clé ne déchiffre pas les documents existants', async () => {
  const otherEncryption = createDocumentEncryption('another-test-key-that-is-also-longer-than-32-characters');
  const encrypted = encryption.encryptDocument('saas_documents', { html: '<p>Existant</p>' });
  const emptyCursor = {
    batchSize() { return this; },
    async *[Symbol.asyncIterator]() {},
  };
  const database = {
    collection(name) {
      return {
        async findOne(filter) {
          return name === 'saas_documents' && filter['html.marker'] ? encrypted : null;
        },
        find() { return emptyCursor; },
        async bulkWrite() {},
      };
    },
  };

  await assert.rejects(
    () => otherEncryption.migrateExistingDocuments(database),
    /authenticate data|Unsupported state/i,
  );
});
