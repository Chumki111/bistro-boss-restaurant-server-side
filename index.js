const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dnejwhv.mongodb.net/?retryWrites=true&w=majority`;

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
    await client.connect();

    const menuCollection = client.db('bistroDB').collection('menu');
    const userCollection = client.db('bistroDB').collection('users');
    const reviewsCollection = client.db('bistroDB').collection('reviews');
    const cartsCollection = client.db('bistroDB').collection('carts');
    const paymentCollection = client.db('bistroDB').collection('payments')

    // jwt related api

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      console.log(user.email);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token })
    })

    // middleware

    const verifyToken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

    // use verify admin after verify token

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      const isAdmin = result?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }

    //  user related api

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

      const result = await userCollection.find().toArray();
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { emil: user?.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // admin api
    app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          role: 'admin'

        }
      }
      const result = await userCollection.updateOne(query, updatedDoc)
      res.send(result)
    })

    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email }
      const result = await userCollection.findOne(query);
      let admin = false;
      if (result) {
        admin = result?.role === 'admin';
      }
      res.send({ admin });
    })

    //  manu related
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result)
    })

    // admin menu insert
    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result)
    })

    //  admin menu delete

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: id }
      const result = await menuCollection.deleteOne(query)
      res.send(result)

    })
    // admin menu update
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      console.log({ id });
      const query = { _id: id }
      const result = await menuCollection.findOne(query)
      console.log(result);
      res.send(result)
    })

    app.patch('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      console.log(item, id);
      const filter = { _id: id }
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe,
          image: item.image
        }


      }
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result)
    })

    // reviews related
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result)
    })

    // cart collection

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartsCollection.insertOne(cartItem);
      res.send(result)
    })
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email }
      const result = await cartsCollection.find(query).toArray();
      res.send(result)
    })

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result)
    })

    // PAYMENT INTENT
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments',async(req,res) =>{
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      // carefully delete each item from the cart
      const query = {_id : {
        $in : payment.cartIds.map(id => new ObjectId(id))
      }}
      const deletedResult = await cartsCollection.deleteMany(query)
      console.log('payment info',payment);
      res.send({paymentResult,deletedResult})
    })
    app.get('/payments/:email',verifyToken,async(req,res) =>{
      const email = req.params.email;
      const query = {email:email};
      if(req.params.body === req.decoded.email){
        return res.status(403).send({ message: 'forbidden access' })
      }
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
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
  res.send('bistro boss is running')
})

app.listen(port, () => {
  console.log(`bistro boss is running on port : ${port}`);
})