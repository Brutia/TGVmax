/**
 * Add train stations (in ../data/stations.json) to local database
 */
const MongoClient = require('mongodb').MongoClient;
const stations = require('../data/stations.json');

(async() => {
  const URL = 'mongodb://localhost:27017';

  const client = await MongoClient.connect(URL, { useNewUrlParser: true, useUnifiedTopology: true });

  client.db('maxplorateur').dropCollection('stations');
  
  const collection = client.db('maxplorateur').collection('stations');

  const bulk = await collection.initializeUnorderedBulkOp();

  for (let station of stations) {
    await bulk.insert(station);
  }

  await bulk.execute();

  await client.close();
})();
