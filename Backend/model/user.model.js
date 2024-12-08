import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    user_name:{
        type: String,
        required:true
    },
    email:{
        type: String,
        required:true,
        unique: true
    },
    password:{
        type: String,
        required:true
    },
    image:{
        type:String
    },
    friendRequests:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }

    ],
    friends:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }
    ],
    sentFriendRequests:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"User"
        }

    ]

});


const UserModel = mongoose.model("User", userSchema);
export default UserModel;