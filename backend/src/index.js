const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

require("dotenv").config({ path: "variables.env" });
const createServer = require("./createServer");
const db = require("./db");

const server = createServer();

// TODO Use express Middleware to handle cookies(JWT)

// REQUEST accept req, parse cookies, parse jwt & auth current user
//Allows us to use any express middleware
server.express.use(cookieParser());

// TODO Use express Middleware to populate current user

// decode the JWT so we can get user ID on each request
server.express.use((req, res, next) => {
  // console.log("Heyyyyyyyyyyy Im a middleware");
  const { token } = req.cookies;
  if (token) {
    const { userId } = jwt.verify(token, process.env.APP_SECRET);
    //put user id onto req for future reqs
    req.userId = userId;
  }
  console.log(token);
  // res.send("test");
  next();
});

server.start(
  {
    cors: {
      credentials: true,
      origin: process.env.FRONTEND_URL
    }
  },
  deets => {
    console.log(`Server is now running on port http:/localhost:${deets.port}`);
  }
);
