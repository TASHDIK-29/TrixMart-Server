const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;


const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    // credentials: true,
    // optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json());





const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.iepmiic.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;



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
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();



        const usersCollection = client.db("TrixMart").collection("users");
        const productsCollection = client.db("TrixMart").collection("products");
        const cartsCollection = client.db("TrixMart").collection("carts");
        const ordersCollection = client.db("TrixMart").collection("orders");



        // middleware
        const verifyToken = (req, res, next) => {
            // console.log('inside verify', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'Unauthorized access!' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, 'SECRET_KEY', (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'Unauthorized access!' })
                }
                req.decoded = decoded;
                next();
            })
        }



        app.post('/register', async (req, res) => {
            const user = req.body;

            // insert email if User does not exist
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist!', insertedId: null })
            }

            const salt = await bcrypt.genSalt(10)
            const securePassword = await bcrypt.hash(req.body.password, salt)

            const userInfo = {
                // firstName: req.body.firstName,
                // lastName: req.body.lastName,
                // email: req.body.email,
                // phone: req.body.phone,
                ...user,
                password: securePassword,
                ordered: 0,
                amount: 0,
            }
            const result = await usersCollection.insertOne(userInfo);

            res.send(result);
        })



        app.post('/login', async (req, res) => {
            const { email, password } = req.body;


            const query = {
                email: email
            };

            const user = await usersCollection.findOne(query);


            if (user) {
                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (isPasswordValid) {
                    console.log('User exists:', user);

                    const token = jwt.sign({ email: user.email }, 'SECRET_KEY', { expiresIn: '1h' });
                    res.json({ token, user });


                    // return res.send({ user: true, pin: true, type: user.type });
                } else {
                    console.log('Invalid pin');
                    return res.send({ user: true, password: false });
                }
            } else {
                console.log('User does not exist');
                return res.send({ user: false });
            }



        })


        // User
        app.get('/user/:email', verifyToken, async(req, res) =>{
            const email = req.params.email;

            const user = await usersCollection.findOne({email})

            res.send(user);
        })

        // Update Profile Image
        app.put('/users/image/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };

            const newImage = req.body;
            console.log(newImage);

            const updatedDoc = {
                $set: {
                    image: newImage.imageURL
                }
            }

            const result = await usersCollection.updateOne(filter, updatedDoc, { upsert: true });

            res.send(result);
        })


        // Home Data
        app.get('/homeData', async (req, res) => {
            const cloths = await productsCollection.find({ category: 'cloth' }).limit(5).toArray();
            const gadgets = await productsCollection.find({ category: 'gadget' }).limit(5).toArray();
            const toys = await productsCollection.find({ category: 'toy' }).limit(5).toArray();
            const furniture = await productsCollection.find({ category: 'furniture' }).limit(5).toArray();

            res.send({ cloths, gadgets, toys, furniture })
        })



        // Load Products
        app.get('/products', async (req, res) => {
            const { category } = req.query;

            console.log('category=', category);

            const result = await productsCollection.find({ category: category }).toArray()

            res.send(result);
        })



        // Add To Cart
        app.post('/addToCart', verifyToken, async (req, res) => {
            const cartInfo = req.body;

            const isExist = await cartsCollection.findOne({ email: cartInfo.email, productId: cartInfo.productId })

            if (!isExist) {
                const result = await cartsCollection.insertOne(cartInfo);

                return res.send(result)
            } else {
                return res.send({ insertedId: false })
            }


        })


        app.get('/allCart', verifyToken, async (req, res) => {
            const { email } = req.query;

            const result = await cartsCollection.find({ email: email }).toArray()

            res.send(result)
        })

        app.patch('/handleCart', async (req, res) => {
            const { option, id, quantity } = req.body;
            console.log(option, id);

            const item = await cartsCollection.findOne({ _id: new ObjectId(id) })
            const remove = await cartsCollection.deleteOne({ _id: new ObjectId(id) })

            if (option !== 'confirm') {
                return res.send({ remove })
            }

            const orderInfo = {
                email: item.email,
                productName: item.productName,
                image: item.image,
                price: item.price,
                productId: item.productId,
                quantity
            }

            const order = await ordersCollection.insertOne(orderInfo);

            const user = await usersCollection.findOne({ email: item.email })
            const newOrdered = user.ordered + 1;
            const newAmount = user.amount + (item.price * quantity);

            const filter = { email: user.email };

            const updateDoc = {
                $set: {
                    ordered: newOrdered,
                    amount: newAmount
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);


            res.send({ remove, order });
        })


        // Orders
        app.get('/orders', verifyToken, async(req, res) =>{
            const {email} = req.query;

            const orders = await ordersCollection.find({email}).toArray();

            res.send(orders);
        })


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
    res.send('TrixMart is on');
})

app.listen(port, () => {
    console.log(`job-task is on port ${port}`);
})