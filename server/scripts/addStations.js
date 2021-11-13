/**
 * Add train stations (in ../data/stations.json) to local database
 */
const MongoClient = require('mongodb').MongoClient;
const stations = require('../data/stations.json');

(async() => {
  const URL = 'mongodb://localhost:27017';

  const client = await MongoClient.connect(URL, { useNewUrlParser: true, useUnifiedTopology: true });

  const collection = client.db('maxplorateur').collection('stations');

  const bulk = await collection.initializeUnorderedBulkOp();

  for (let station of stations) {
    await bulk.insert(station);
  }

  console.log('ici');

  await bulk.execute();

  console.log('ici1');

  await client.close();

  console.log('ici2');
})();
