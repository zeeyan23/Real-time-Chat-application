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
    const {user_name, email, password} = req.body;

    const user = new UserModel({user_name, email, password});
    user.save().then(()=>{
        res.status(200).json({ message: "User Account Created"})
    }).catch((err)=>{
        console.log("Failed to register the User", err);
        res.status(500).json({message:"Error registering your account"})
    })
})

const createToken = (userId) =>{
    const payload={
        userId:userId
    }

    const token = jsonwebtoken.sign(payload, "Q$r2K6W8n!jCW%Zk", {expiresIn: "1h"});

    return token;
}
// Login user
app.post('/user_login',(req, res)=>{
    const { email, password} = req.body;

    if(!email || !password){
        return res.status(400).json({message: "Please enter both email and password"})
    }

    UserModel.findOne({email}).then((user)=>{
        if(!user){
            return res.status(404).json({message: "User Not Found"})
        }

        if(user.password !== password){
            return res.status(401).json({message: "Invalid Password"})
        }

        const token= createToken(user.id);
        res.status(200).json({token})
    }).catch((error)=> {
        console.log("Error in finding the user", error);
        res.status(500).json({message: "Error in finding the user"})
    })
})

//retrive all users
app.get('/all_users/:userId',(req, res)=>{

    const currentUser = req.params.userId;

    UserModel.find({_id:{$ne: currentUser}}).then((users)=>{
        res.status(200).json({users})
    }).catch((error)=> {
        console.log("Error in finding the users", error);
        res.status(500).json({message: "Error in finding the users"})
    })
})

//send friend request
app.post('/friend-request/',async (req, res)=>{

    const {currentUserId, selectedUserId} = req.body;

    try {
        await UserModel.findByIdAndUpdate(selectedUserId,{
            $push: {friendRequests : currentUserId}
        });

        await UserModel.findByIdAndUpdate(currentUserId,{
            $push: {sentFriendRequests : selectedUserId}
        });

        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(500);
    }
})

//Get friend requests api
app.get('/get-friend-request/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        const users = await UserModel.findById(userId).populate("friendRequests","user_name email") .lean()       

        const friendRequests = users.friendRequests;
        res.json(friendRequests)
    } catch (error) {
        res.sendStatus(500);
    }
})

//accept friend api
app.post('/accept-friend-request/accept',async (req, res)=>{

    try {
        const {senderId, recepientId} = req.body;
        const sender = await UserModel.findById(senderId)
        const recepient = await UserModel.findById(recepientId)           

        sender.friends.push(recepientId)
        recepient.friends.push(senderId)

        recepient.friendRequests = recepient.friendRequests.filter((request)=> request.toString() !== senderId.toString())
        sender.sentFriendRequests = sender.sentFriendRequests.filter((request)=> request.toString() !== recepientId.toString())

        await sender.save();
        await recepient.save();
        
        res.status(200).json({message:"Friend request accepted"})
    } catch (error) {
        res.sendStatus(500);
    }
})