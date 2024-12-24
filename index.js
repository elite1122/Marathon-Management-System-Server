const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@elite.i866s.mongodb.net/?retryWrites=true&w=majority&appName=Elite`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const marathonsCollection = client.db('marathonManagementDB').collection('marathons');

    // All marathons data
    app.get('/marathons', async (req, res) => {
        const email = req.query.email;
        let query = {};
        if(email){
            query = { creatorEmail: email }
        }
        const cursor = marathonsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
    })

    // Marathon details related apis
    app.get('/marathons/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await marathonsCollection.findOne(query);
        res.send(result);
    })

    // In Home Marathons related apis
    app.get('/marathonsInHome', async (req, res) => {
        const marathonsInHome = await marathonsCollection.find()
        .limit(6)
        .toArray();
        res.send(marathonsInHome);
    })

    // New marathon create
    app.post('/marathons', async (req, res) => {
        const newMarathon = req.body;
        const result = await marathonsCollection.insertOne(newMarathon);
        res.send(result);
    })

     // Update marathon data (new endpoint)
     app.put('/marathons/:id', async (req, res) => {
        const id = req.params.id;
        const updatedMarathon = req.body;

        // Validate if the marathon exists
        const query = { _id: new ObjectId(id) };
        const existingMarathon = await marathonsCollection.findOne(query);
        if (!existingMarathon) {
            return res.status(404).json({ message: "Marathon not found" });
        }

        // Update the marathon
        const result = await marathonsCollection.updateOne(
            query,
            { $set: updatedMarathon } // Updates the marathon with the new data
        );

        // Send the updated marathon as response
        res.send(result);
    });

    // Delete Created Marathon
    app.delete('/marathons/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await marathonsCollection.deleteOne(query);
        res.send(result);
    })


    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");


  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Marathon server is running');
});

app.listen(port, () =>{
    console.log(`Marathon server is running at: ${port}`);
});