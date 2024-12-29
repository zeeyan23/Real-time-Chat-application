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
import multer from "multer";
import axios from "axios"
import { Server } from "socket.io";
import http from "http";
import { createServer } from 'node:http';
import { ObjectId } from 'mongodb';



const app = express()
const server = createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.send('Server is running!');
});
const connectedUsers = {};

io.on('connection', (socket) => {

  socket.on("registerUser", (userId) => {
    connectedUsers[userId] = socket.id;
    console.log(`User registered: ${userId}`);
  });

  // Listening for message events
  socket.on("send_message", (data) => {
    console.log("Message received:", data);

    // Emit the message to the intended recipient
    io.to(data.receiverId).emit("receive_message", data);

    // Optionally, broadcast to everyone for testing
    socket.broadcast.emit("update_chat", data);
  });


  
  socket.on('joinRoom', (userId) => {
    socket.join(userId); // User joins a room with their user ID
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(3000, () => {
  console.log('server running');
});

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

app.use("/files", express.static("D:/CHAT APP/Backend/files"));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
 // Create HTTP server

//API's

// Registering User

app.get('/', (req, res) => {
    res.send('Server is running!');
});

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

    const token = jsonwebtoken.sign(payload, "Q$r2K6W8n!jCW%Zk");

    return token;
}
// Login user
app.post('/user_login',(req, res)=>{
    const { email, password, expoPushToken} = req.body;
    
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

        if (expoPushToken) {
            user.expoPushToken = expoPushToken;
            user.save();
        }


        const token= createToken(user.id);
        res.status(200).json({token, userId: user.id})
    }).catch((error)=> {
        console.log("Error in finding the user", error);
        res.status(500).json({message: "Error in finding the user"})
    })
})

app.get('/get-user-id-from-token', async (req, res) => {
  try {
      const token = req.headers.authorization?.split(' ')[1];  // Extract the token
      if (!token) {
          return res.status(400).json({ message: "Token is required" });
      }

      const decodedToken = jsonwebtoken.verify(token, 'Q$r2K6W8n!jCW%Zk'); // Replace with your secret key
      const userId = decodedToken.userId;

      return res.status(200).json({ userId });
  } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error decoding token" });
  }
});



app.get("/all_users/:userId", (req, res) => {
    const loggedInUserId = req.params.userId;
  
    UserModel.find({ _id: { $ne: loggedInUserId } })
      .then((users) => {
        res.status(200).json(users);
      })
      .catch((err) => {
        console.log("Error retrieving users", err);
        res.status(500).json({ message: "Error retrieving users" });
      });
  });

//send friend request
app.post('/friend-request/',async (req, res)=>{

    const {currentUserId, selectedUserId} = req.body;

    try {
        await UserModel.findByIdAndUpdate(selectedUserId,{
            $addToSet: {friendRequests : currentUserId}
        });

        await UserModel.findByIdAndUpdate(currentUserId,{
            $addToSet: {sentFriendRequests : selectedUserId}
        });

        const sender = await UserModel.findById(currentUserId).select("user_name");
        const recipientSocketId = connectedUsers[selectedUserId];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit("friendRequestReceived", {
                senderId: currentUserId,
                senderName: sender.user_name,
            });
        }


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

        const senderSocketId = connectedUsers[senderId];
        const recepientSocketId = connectedUsers[recepientId];

        if (senderSocketId) {
            io.to(senderSocketId).emit('friendRequestAccepted', {
                userId: recepientId,
            });
        }

        if (recepientSocketId) {
            io.to(recepientSocketId).emit('friendRequestAccepted', {
                userId: senderId,
            });
        }

        
        res.status(200).json({message:"Friend request accepted"})
    } catch (error) {
        res.sendStatus(500);
    }
})

app.get('/has-friends/:userId',async (req, res)=>{
  try {
      const {userId} = req.params;
      const messageExists = await UserModel.exists({"friends": userId });
  
      if (messageExists) {
        return res.status(200).json({ exists: true, message: "Message exists in the database." });
      } else {
        return res.status(404).json({ exists: false, message: "Message not found." });
      }

  } catch (error) {
      console.log(error)
      res.sendStatus(500);
  }
})

//Get all friends to chat
app.get('/get-all-friends/:userId',async (req, res)=>{
    try {
        const {userId} = req.params;
        const users = await UserModel.findById(userId).populate("friends","user_name email").populate("pinnedChats", "_id").lean()       

        res.json({
          friends: users.friends,
          pinnedChats: users.pinnedChats,
      });

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

//End point to save message
const storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null,'files/')
    },
    filename: function (req, file, cb){
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null,uniqueSuffix + '-' + file.originalname);
    }
})
// const upload = multer ({storage :storage});
const upload = multer ({storage :storage,
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|mp4|mov|pdf|docx|pptx|xlsx|zip/; 
        const extName = fileTypes.test(file.mimetype);
        if (extName) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed!'), false);
        }
    },
});


app.post('/messages',upload.single("file"),async (req, res)=>{
    try {
        const {senderId, recepientId, messageType, message, duration, videoName, replyMessage, fileName} = req.body;
        console.log(req.body)
        const newMessage = new MessageModel({
            senderId,
            recepientId,
            messageType,
            message,
            timeStamp:new Date(),
            replyMessage: replyMessage ? replyMessage : null,
            imageUrl:messageType ==='image' ? req.file?.path : null,
            videoUrl: messageType === 'video' ? req.file?.path.replace(/\\/g, '/') : null,
            duration :messageType === 'video' ? Math.floor(duration / 1000) : null,
            documentUrl: ['pdf', 'docx', 'pptx', 'xlsx', 'zip'].includes(messageType) ? req.file?.path.replace(/\\/g, '/') : null,
            fileName: ['pdf', 'docx', 'pptx', 'xlsx', 'zip'].includes(messageType) ? fileName :null,
            videoName : messageType === 'video' ? videoName : null
        })
        const savedMessage = await newMessage.save();

        //const messageData = await MessageModel.findById(newMessage._id).populate("senderId", "_id user_name");  
        const messageData = await MessageModel.findById(savedMessage._id).populate("senderId", "_id user_name");
        io.to(recepientId).emit("newMessage", messageData);

        console.log(`Emitting message to recipient ${recepientId}`);  
        

        const recipient = await UserModel.findById(recepientId);
        if (!recipient || !recipient.expoPushToken) {
            return res.status(404).json({ message: "Recipient not found or push token missing." });
        }
        const sender = await UserModel.findById(senderId);
        const userName = sender.user_name;
        const notificationData = {
            to: recipient.expoPushToken, 
            sound: 'default',
            title: `${messageType} Message from ${sender.user_name}`,
            body: messageType === 'text' ? message : `You received a ${messageType}.`,
            data: { senderId, recepientId, messageType, userName},
        };

        await axios.post('https://exp.host/--/api/v2/push/send', notificationData, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        res.status(200).json({message:"Message sent successfully and notification delivered."})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

//fetch messages
app.get('/get-messages/:senderId/:recepientId',async (req, res)=>{
    try {
        const {senderId, recepientId} = req.params;
        console.log(`Fetching messages between ${senderId} and ${recepientId}`);
        const message = await MessageModel.find({
            $or:[
                {senderId : senderId, recepientId: recepientId},
                {senderId : recepientId, recepientId: senderId},
            ]
        })
        .populate("senderId", "_id user_name")
        .populate("replyMessage");
        res.json({message})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

// app.get('/user/:userId',async (req, res)=>{
//     try {
//         const {userId} = req.params;
//         const recepientId = await UserModel.findById(userId) 
//         res.json(recepientId);

//     } catch (error) {
//         console.log(error)
//         res.sendStatus(500);
//     }
// })


//delete messages
app.post('/deleteMessages/',async (req, res)=>{
    try {
        const {messages} = req.body;
        
        if(!Array.isArray(messages) || messages.length === 0){
            return res.status(400).json({message: "invalid req body"});
        }
        await MessageModel.deleteMany({_id:{$in: messages}})       

        res.json({messages : "Message deleted successfully"})

    } catch (error) {
        console.log(error)
        res.sendStatus(500);
    }
})

app.get('/friend-requests/sent/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        const user = await UserModel.findById(userId).populate("sentFriendRequests","user_name email").lean();

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const sentFriendRequests = user.sentFriendRequests;
        res.json(sentFriendRequests);
    } catch (error) {
        console.log("error",error);
        res.status(500).json({ error: "Internal Server" });
    }
})

app.get('/friend-requests/received/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        const user = await UserModel.findById(userId).populate("friendRequests","user_name email").lean();

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const sentFriendRequestsReceived = user.friendRequests;
        res.json(sentFriendRequestsReceived);
    } catch (error) {
        console.log("error",error);
        res.status(500).json({ error: "Internal Server" });
    }
})

app.get('/friends/:userId',async (req, res)=>{

    try {
        const {userId} = req.params;
        UserModel.findById(userId).populate("friends").then((user)=>{
            if(!user){
                res.status(404).json({message: "user not found"});
            }

            const friendIds= user.friends.map((friend)=> friend._id);
            res.status(200).json(friendIds);
        });
    } catch (error) {
        res.sendStatus(500);
    }
})

app.post('/messages/forward', async (req, res) => {
    const { senderId, recipientId, messageIds } = req.body;
    

    try {
      // Validate IDs
      if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(recipientId)) {
        return res.status(400).json({ error: 'Invalid senderId or recipientId' });
      }
      if (!messageIds || messageIds.length === 0) {
        return res.status(400).json({ error: 'No messages selected for forwarding' });
      }
      const originalMessages = await MessageModel.find({ _id: { $in: messageIds } });
  
      if (originalMessages.length === 0) {
        return res.status(404).json({ error: 'No messages found' });
      }
  
      const forwardedMessages = originalMessages.map((msg) => ({
        senderId,
        recepientId: recipientId,
        messageType: msg.messageType,
        message: msg.message,
        imageUrl: msg.imageUrl,
        videoUrl: msg.videoUrl,
        videoName: msg.videoName,
        duration: msg.duration,
        replyMessage: msg.replyMessage,
      }));
  
      await MessageModel.insertMany(forwardedMessages);
  
      res.status(200).json({ message: 'Messages forwarded successfully' });
    } catch (error) {
      console.error('Error forwarding messages:', error);
      res.status(500).json({ error: 'Error forwarding messages' });
    }
  });
  
  app.patch('/star-messages', async (req, res) => {
    try {
        const { messageIds, starredBy } = req.body;

        const updatedMessages = await MessageModel.updateMany(
          { _id: { $in: messageIds } },
          { starredBy }, 
          { new: true }  
        );
    
        if (updatedMessages.nModified === 0) {
          return res.status(404).json({ message: 'No messages found to update' });
        }
    
        return res.status(200).json({ message: 'Messages updated successfully' });
      } catch (error) {
        console.error('Error updating starred messages:', error);
        return res.status(500).json({ message: 'Internal server error' });
      }
  });

  app.get('/get-starred-messages/:userId', async (req, res) => {
    try {
      const userId = req.params.userId;
      const starredMessages = await MessageModel.find({ starredBy: userId })
        .populate('senderId', 'user_name')
        .populate('starredBy', 'user_name')  
        .populate('recepientId', 'user_name')
        .sort({ created_date: -1 });
  
      if (starredMessages.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No starred messages found for the user",
        });
      }
  
      res.status(200).json(starredMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch messages",
        error: error.message,
      });
    }
  });
  
  app.get('/get-starred-message/:id/:userId/', async (req, res) => {
    try {
      const {id, userId} = req.params;
      const messageExists = await MessageModel.exists({ _id: id,"starredBy": userId });
      console.log("messageExists",messageExists)
  
      if (messageExists) {
        return res.status(200).json({ exists: true, message: "Message exists in the database." });
      } else {
        return res.status(404).json({ exists: false, message: "Message not found." });
      }
    } catch (error) {
      console.error("Error checking message existence:", error);
      res.status(500).json({ exists: false, error: "Internal server error" });
    }
  });

  app.delete('/delete-starred-message/:userId/:id', async (req, res) => {
    try {
      const {id, userId} = req.params;
  
      const result = await MessageModel.updateOne(
        { _id: id },
        { $pull: { starredBy: userId } }
      );
  
      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: "Message not found or user was not starred." });
      }
  
      res.status(200).json({ message: "Starred message removed successfully." });
    } catch (error) {
        console.error("Error removing starred message:", error);
        res.status(500).json({ message: "Internal server error." });
    }
  });

  app.post('/clear-chat', async (req, res) => {
    try {
        const {userId, otherUserId} = req.body;
        const result = await MessageModel.updateMany(
          {
            
            $or: [
              { senderId: userId, recepientId: otherUserId },
              { senderId: otherUserId, recepientId: userId },
            ],
          },
          { $addToSet: { clearedBy: userId } }
        );
    
        const updatedMessages = await MessageModel.find({
            $or: [
              { senderId: userId, recepientId: otherUserId },
              { senderId: otherUserId, recepientId: userId }
            ],
            clearedBy: { $ne: userId } 
          });
          res.status(200).json(updatedMessages);
      } catch (error) {
        console.error('Error clearing chat:', error);
        res.status(500).json({ message: 'Internal server error.' });
      }
  });
  

  // app.delete('/api/messages', async (req, res) => {
  //   try {
  //     await MessageModel.deleteMany({});
  //     res.status(200).json({ message: 'All messages have been deleted successfully.' });
  //   } catch (error) {
  //     res.status(500).json({ error: 'An error occurred while deleting messages.' });
  //   }
  // });

  //pinning chat
  app.patch("/updatePinnedChats", async (req, res) => {
    const { userId, pinnedChats } = req.body;
    console.log(req.body)
    if (!userId || !Array.isArray(pinnedChats)) {
      return res.status(400).json({ message: "Invalid request data" });
    }
  
    try {
      // Update the user's pinnedChats
      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $addToSet: { pinnedChats: { $each: pinnedChats } } }, // Add chats to the array without duplicates
        { new: true }
      );

      console.log(updatedUser)
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const socketId = connectedUsers[userId];
      if (socketId) {
        io.to(socketId).emit("pinnedChatsUpdated", updatedUser.pinnedChats);
      }
      res.status(200).json({
        message: "Pinned chats updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      console.error("Error updating pinned chats:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/get-pinned-chats/:id/:userId/', async (req, res) => {
    const { id, userId } = req.params;
  
    try {
      // Query the User model to check if the pinnedChats array contains the given id
      const user = await UserModel.findOne({ _id: userId, pinnedChats: id });
  
      if (user) {
        // If the user is found and pinnedChats contains the id
        res.status(200).json({ exists: true });
      } else {
        // If the user is not found or pinnedChats does not contain the id
        res.status(200).json({ exists: false });
      }
    } catch (error) {
      console.error("Error checking Chat existence:", error);
      res.status(500).json({ exists: false, error: "Internal server error" });
    }
  });

  app.delete('/unPinChats/:id/:userId', async (req, res) => {
    try {
      const {id, userId} = req.params;
      console.log(id, userId)
      const result = await UserModel.updateMany(
        { _id: userId },
        { $pull: { pinnedChats: id } }
      );
  
      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: "Chat not found or user was not pinned." });
      }
  
      const user = await UserModel.findById(userId);
      const socketId = connectedUsers[userId];
      if (socketId) {
        io.to(socketId).emit("pinnedChatsUpdated", user.pinnedChats);
      }
      res.status(200).json({ message: "Pinned message removed successfully." });
    } catch (error) {
        console.error("Error removing pinned message:", error);
        res.status(500).json({ message: "Internal server error." });
    }
  });
  

//   app.delete('/accept-friend-request/remove', async (req, res) => {
//     try {
//         const userId = new ObjectId("676687f69c120a4cba2c52da");
//         const friendIdToRemove = new ObjectId("6766789c9c01a2601d81bc57");

//         const result = await UserModel.updateOne(
//             { _id: userId },
//             { $pull: { friends: friendIdToRemove } }
//         );

//         if (result.modifiedCount > 0) {
//             res.status(200).json({ message: "Friend removed successfully" });
//         } else {
//             res.status(404).json({ message: "Friend not found or already removed" });
//         }
//     } catch (error) {
//         console.error("Error removing friend:", error.message, error.stack);
//         res.status(500).json({ message: "Internal Server Error", error: error.message });
//     }
// });

// app.delete('/friend-request/remove', async (req, res) => {
//   try {
//       const userId = new ObjectId("676688039c120a4cba2c52dc");
//       const friendIdToRemove = new ObjectId("676687f69c120a4cba2c52da");

//       const result = await UserModel.updateOne(
//           { _id: userId },
//           { $pull: { friends: friendIdToRemove } }
//       );

//       if (result.modifiedCount > 0) {
//           res.status(200).json({ message: "Friend removed successfully" });
//       } else {
//           res.status(404).json({ message: "Friend not found or already removed" });
//       }
//   } catch (error) {
//       console.error("Error removing friend:", error.message, error.stack);
//       res.status(500).json({ message: "Internal Server Error", error: error.message });
//   }
// });
