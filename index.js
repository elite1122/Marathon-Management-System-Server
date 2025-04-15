require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://gomarathonbd.web.app',
        'https://gomarathonbd.firebaseapp.com'
    ],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

    // verify the token
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.user = decoded;
        next();
    })
}


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
        const marathonRegistrationCollection = client.db('marathonManagementDB').collection('registerInfo');

        // auth related APIs
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });

            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
                })
                .send({ success: true })

        });

        app.post('/logout', (req, res) => {
            res
                .clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
                })
                .send({ success: true })
        })

        // All marathons data
        app.get('/marathons', async (req, res) => {
            const sortOrder = req.query.sort === 'desc' ? -1 : 1;
            let query = {};

            const cursor = marathonsCollection.find(query).sort({ createdAt: sortOrder });
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

        // All Register Marathon data get related apis
        app.get('/registerMarathon', verifyToken, async (req, res) => {
            const email = req.query.email;
            const searchQuery = req.query.search || ''; // Default to an empty string if no search query is provided

            // token email !== query email
            if (req.user.email !== req.query.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            let query = {};

            if (email) {
                query.email = email; // Filter by user email
            }

            if (searchQuery) {
                query.marathonTitle = { $regex: searchQuery, $options: 'i' }; // Case-insensitive search
            }
            const cursor = marathonRegistrationCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        });


        // New marathon create
        app.post('/marathons', async (req, res) => {
            const newMarathon = req.body;
            const result = await marathonsCollection.insertOne(newMarathon);
            res.send(result);
        })

        // Marathon Registration related apis
        app.post('/registerMarathon', async (req, res) => {
            const newRegister = req.body;

            try {
                // Step 1: Insert the registration data
                const result = await marathonRegistrationCollection.insertOne(newRegister);

                if (!result.insertedId) {
                    return res.status(500).json({ message: "Failed to register marathon" });
                }

                // Step 2: Increment the total registration count for the corresponding marathon
                const marathonId = new ObjectId(newRegister.marathonId);
                const updateResult = await marathonsCollection.updateOne(
                    { _id: marathonId },
                    { $inc: { totalRegistrationCount: 1 } }
                );

                // Log success, but don't block response due to this step
                if (updateResult.modifiedCount === 1) {
                    console.log("Marathon registration count incremented successfully.");
                } else {
                    console.warn("Registration successful, but failed to update registration count.");
                }

                // Step 3: Send the success response
                res.status(200).json({
                    message: "Registration successful",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Error in /registerMarathon:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });


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

        // Update Registration data
        app.put('/registerMarathon/:id', async (req, res) => {
            const id = req.params.id;
            const updatedRegisterInfo = req.body;

            // Validate if the marathon exists
            const query = { _id: new ObjectId(id) };
            const existingRegistration = await marathonRegistrationCollection.findOne(query);
            if (!existingRegistration) {
                return res.status(404).json({ message: "Registration not found" });
            }

            // Update the marathon
            const result = await marathonRegistrationCollection.updateOne(
                query,
                { $set: updatedRegisterInfo } // Updates the marathon with the new data
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

        // Delete Registration
        app.delete('/registerMarathon/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            try {
                // Step 1: Retrieve the marathonId before deletion
                const registration = await marathonRegistrationCollection.findOne(query);
                if (!registration) {
                    return res.status(404).json({ message: 'Registration not found' });
                }

                const marathonId = registration.marathonId;

                // Step 2: Delete the registration
                const deleteResult = await marathonRegistrationCollection.deleteOne(query);
                if (deleteResult.deletedCount === 0) {
                    return res.status(500).json({ message: 'Failed to delete registration' });
                }

                // Step 3: Decrement the totalRegistrationCount for the marathon
                const updateResult = await marathonsCollection.updateOne(
                    { _id: new ObjectId(marathonId) },
                    { $inc: { totalRegistrationCount: -1 } }
                );

                // Log success or warning
                if (updateResult.modifiedCount === 1) {
                    console.log('Total registration count decremented successfully.');
                } else {
                    console.warn('Registration deleted, but failed to update registration count.');
                }

                // Step 4: Send a success response
                res.status(200).json({ message: 'Registration deleted successfully' });
            } catch (error) {
                console.error('Error in DELETE /registerMarathon:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });



        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Marathon server is running');
});

app.listen(port, () => {
    console.log(`Marathon server is running at: ${port}`);
});