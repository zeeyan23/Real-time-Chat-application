import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    senderId:{
        
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
        
    },
    recepientId:{
        
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
        
    },
    messageType:{
        type: String,
        enum:["text", "image", "video", "audio"]
    },
    message:String,
    imageUrl:String,
    videoUrl: String, 
    duration: Number,
    timeStamp:{
        type: Date,
        default: Date.now
    }

});

const MessageModel = mongoose.model("Message", messageSchema);
export default MessageModel;