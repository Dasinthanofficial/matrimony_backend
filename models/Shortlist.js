import mongoose from 'mongoose';
const { Schema } = mongoose;

const shortlistSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  shortlistedUserId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  shortlistedProfileId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Profile' 
  },
  note: { type: String, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
});

shortlistSchema.index({ userId: 1, shortlistedUserId: 1 }, { unique: true });
shortlistSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Shortlist', shortlistSchema);