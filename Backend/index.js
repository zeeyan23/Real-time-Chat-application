import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import passport from "passport";
import LocalStratergy from "passport-local"
import cors from "cors";
import jsonwebtoken from "jsonwebtoken";
import dotenv from "dotenv"
import UserModel from "./model/user.model.js";
import MessageModel from "./model/message.model.js";

const app = express()
const port = 3000

app.use(cors());
app.use(bodyParser.urlencoded({extended:false}));
app.use(bodyParser.json());
app.use(passport.initialize())

dotenv.config()
const PORT= process.env.PORT || 3000;
const uri= process.env.MONGODB_URI;

try{
    mongoose.connect(uri);
    console.log("connected to MongoDB");
}catch(err){
    console.log("Error connection", err);
}


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
});

//API's
// Registering User
app.post('/create_user',(req, res)=>{
    console.log(req.body)
    const {user_name, email, password} = req.body;

    const user = new UserModel({user_name, email, password});
    user.save().then(()=>{
        res.status(200).json({ message: "User Account Created"})
    }).catch((err)=>{
        console.log("Failed to register the User", err);
        res.status(500).json({message:"Error registering your account"})
    })
})

