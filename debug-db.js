const { providerFor } = require('./src/lib/storage/record');

async function debug() {
  const provider = providerFor('local');
  const docs = await provider.list('events');
  console.log('Total docs in events:', docs.length);
  if (docs.length > 0) {
    console.log('First doc sample:', JSON.stringify(docs[0], null, 2));
    const types = new Set(docs.map(d => d.type));
    console.log('Types found in events:', Array.from(types));
  }
}

debug().catch(console.error);
