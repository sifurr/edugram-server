const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_SECRET);

//middlewares
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log("Cookies:", req.cookies);
  // console.log("Cookies:", token);

  if (!token) {
    return res.status(401).send({ message: "401, Your're not authorized" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "401, You're not authorized" });
    }
    req.decoded = decoded;
    // console.log("user index.js---> ", decoded)
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ddl1jzo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const database = client.db("edugramDB");
    const userCollection = database.collection("users");
    const classCollection = database.collection("classes");
    const cartCollection = database.collection("carts");
    const paymentCollection = database.collection("payments");
    const teacherRequestCollection = database.collection("teacherRequests");
    const feedbackCollection = database.collection("feedbacks");
    const assignmentCollection = database.collection("assignments");
    const submissionCollection = database.collection("submissions");

    // auth related endpoints
    app.post("/api/v1/auth/access-token", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      // console.log(token);
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false,
          // sameSite: "none",
        })
        .send({ success: true });
    });

    // middlewares
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      // console.log("admin email:", email);
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "access forbidden" });
      }
      next();
    };

    const verifyTeacher = async (req, res, next) => {
      const email = req.decoded.email;
      // console.log("teacher email:", email);
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "teacher";
      if (!isAdmin) {
        return res.status(403).send({ message: "access forbidden" });
      }
      next();
    };

    app.get("/api/v1/users/admin/:email", verifyToken, async (req, res) => {
      const paramEmail = req.params.email;
      if (paramEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const query = { email: paramEmail };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // user related api
    app.get("/api/v1/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/api/v1/user", verifyToken, async (req, res) => {
      const queryEmail = req.query.email;
      // console.log("req--->",req)
      // console.log("query email from api--->",queryEmail)
      if (queryEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const query = { email: queryEmail };
      const user = await userCollection.findOne(query);
      res.send({ user });
    });

    app.post("/api/v1/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/api/v1/users/make-admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const userId = req.params.id;
        const filter = { _id: new ObjectId(userId) };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);

        res.send({ success: true, message: "User is now an admin" });
      }
    );

    app.patch(
      "/api/v1/users/add-phone/:email",
      verifyToken,
      async (req, res) => {
        const userEmail = req.params.email;
        const tokenMail = req.decoded.email;
        const filter = { email: userEmail };
        if (userEmail !== tokenMail) {
          return res.status(403).send({ message: "Forbidden" });
        }
        const userPhone = req.body;
        const updateDoc = {
          $set: { phone: userPhone.phone },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // teacher request related endpoints
    app.get("/api/v1/users/teacher/:email", verifyToken, async (req, res) => {
      const paramEmail = req.params.email;
      if (paramEmail !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const query = { email: paramEmail };
      const user = await userCollection.findOne(query);
      let teacher = false;
      if (user) {
        teacher = user?.role === "teacher";
      }
      res.send({ teacher });
    });

    app.get(
      "/api/v1/users/teacher-requests",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await teacherRequestCollection.find().toArray();
        res.send(result);
      }
    );

    app.get(
      "/api/v1/users/my-teaching-requests/:email",
      verifyToken,
      async (req, res) => {
        const paramsEmail = req.params.email;
        // console.log("params Email",paramsEmail)
        const tokenEmailFromVerifyToken = req.decoded.email;
        // console.log("token Email",tokenEmailFromVerifyToken)
        if (paramsEmail !== tokenEmailFromVerifyToken) {
          return res.status(403).send({ message: "403, Access forbidden" });
        }
        const query = { email: paramsEmail };
        const result = await teacherRequestCollection.findOne(query);
        res.send(result);
      }
    );

    app.post(
      "/api/v1/users/teacher-requests",
      verifyToken,
      async (req, res) => {
        const teacherReq = req.body;
        const result = await teacherRequestCollection.insertOne(teacherReq);
        res.send(result);
      }
    );

    app.patch(
      "/api/v1/users/make-teacher/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const requestId = req.params.id;
        const filter = { _id: new ObjectId(requestId) };
        const teacherRequest = await teacherRequestCollection.findOne(filter);

        if (teacherRequest) {
          const userEmail = teacherRequest.email;
          // console.log("user email",userEmail)
          const userFilter = { email: userEmail };
          // console.log("user filer",userFilter)

          const statusUpdateDoc = {
            $set: { approval: "approved" },
          };
          await teacherRequestCollection.updateOne(filter, statusUpdateDoc);

          const userRoleUpdateDoc = {
            $set: { role: "teacher" },
          };

          const result = await userCollection.updateOne(
            userFilter,
            userRoleUpdateDoc
          );

          res.send({ success: true, message: "User is now a teacher", result });
        }
      }
    );

    app.patch(
      "/api/v1/users/reject-teacher/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const requestId = req.params.id;
        const filter = { _id: new ObjectId(requestId) };
        const teacherRequest = await teacherRequestCollection.findOne(filter);

        if (teacherRequest) {
          const userEmail = teacherRequest.email;
          const userFilter = { email: userEmail };

          const statusUpdateDoc = {
            $set: { approval: "pending" },
          };
          await teacherRequestCollection.updateOne(filter, statusUpdateDoc);

          const userRoleUpdateDoc = {
            $set: { role: "student" },
          };
          const result = await userCollection.updateOne(
            userFilter,
            userRoleUpdateDoc
          );

          res.send({
            success: true,
            message: "Teacher request rejected",
            result,
          });
        }
      }
    );

    // class related endpoints
    app.get("/api/v1/users/classes/:email", verifyToken, async (req, res) => {
      const userEmail = req.decoded.email;
      const paramEmail = req.params.email;
      // console.log("paramEmail:", paramEmail);
      // console.log("decodedEmail:", req.decoded.email);

      if (paramEmail !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const userPayments = await paymentCollection
        .find({ email: userEmail })
        .toArray();
      const uniqueClassIds = [
        ...new Set(userPayments.flatMap((payment) => payment.classId)),
      ];

      const classes = await classCollection
        .find({
          _id: { $in: uniqueClassIds.map((id) => new ObjectId(id)) },
        })
        .toArray();

      const totalEnrollments = userPayments.reduce(
        (total, payment) => total + payment.classId.length,
        0
      );

      const uniqueStudents = [
        ...new Set(userPayments.map((payment) => payment.email)),
      ];
      const uniqueStudentsCount = uniqueStudents.length;

      res.send({ classes, totalEnrollments, uniqueStudentsCount });
    });

    app.get("/api/v1/classes/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      // console.log("id class req", id);
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    app.get(
      "/api/v1/users/classes/:id",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const id = req.params.id;
        // console.log("id class req", id);
        const query = { _id: new ObjectId(id) };
        const result = await classCollection.findOne(query);
        res.send(result);
      }
    );

    app.get(
      "/api/v1/users/classes-requests",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const result = await classCollection.find().toArray();
        res.send(result);
      }
    );

    app.get("/api/v1/users/all-classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.get(
      "/api/v1/users/classes",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const email = req.query.email;
        // console.log("email class req", email);
        const query = { email: email };
        const result = await classCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.post(
      "/api/v1/users/classes",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const classInfo = req.body;
        // console.log(classInfo);
        const result = await classCollection.insertOne(classInfo);
        res.send(result);
      }
    );

    app.patch(
      "/api/v1/users/classes/:id",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const id = req.params.id;
        // console.log("patch id--->", id)
        const classInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            title: classInfo.title,
            price: classInfo.price,
            description: classInfo.description,
            image: classInfo.image,
          },
        };

        const result = await classCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    app.patch(
      "/api/v1/users/class-status/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        // console.log("patch approved id--->", id)
        const classInfo = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: classInfo.status,
          },
        };

        const result = await classCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.delete(
      "/api/v1/users/classes/:id",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const id = req.params.id;
        // console.log("id class req", id);
        const query = { _id: new ObjectId(id) };
        const result = await classCollection.deleteOne(query);
        res.send(result);
      }
    );

    // cart related endpoints
    app.get("/api/v1/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/api/v1/carts", async (req, res) => {
      const cartItem = req.body;
      // console.log(cartItem)
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete("/api/v1/carts/:id", async (req, res) => {
      const id = req.params.id;
      // console.log("delete id: ", id);
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payments related endpoints
    app.get("/api/v1/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/api/v1/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/api/v1/payments", async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      // console.log("Payment info: ",payment);
      const query = {
        _id: { $in: payment.cartIds.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult });
    });

    // feedback related endpoints
    app.post("/api/v1/users/class-feedback", verifyToken, async (req, res) => {
      const feedback = req.body;
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });

    // class assignment related endpoints
    app.get(
      "/api/v1/users/class-assignments/:classId",
      verifyToken,
      async (req, res) => {
        const id = req.params.classId;
        // console.log("assignment", id)
        const query = { classId: id };
        const result = await assignmentCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.post(
      "/api/v1/users/class-assignment",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const assignment = req.body;
        const result = await assignmentCollection.insertOne(assignment);
        res.send(result);
      }
    );

    // assignment submission related endpoints
    app.get(
      "/api/v1/users/assignments-submissions/:classId", verifyToken, verifyTeacher,
      async (req, res) => {
        const classId = req.params.classId;
        // const query = { classId: id };
        const totalSubmission = await submissionCollection.countDocuments({classId});       
        res.send({totalSubmission});
      }
    );

    app.post(
      "/api/v1/users/assignments-submissions", verifyToken,
      async (req, res) => {
        const submission = req.body;
        const result = await submissionCollection.insertOne(submission);        
        res.send(result);
      }
    );


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`The server is running on port ${port}`);
});
