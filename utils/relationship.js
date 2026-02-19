import Interest from '../models/Interest.js';

export const isMatchBetween = async (userA, userB) => {
  if (!userA || !userB) return false;
  const a = userA.toString();
  const b = userB.toString();
  const found = await Interest.exists({
    status: 'accepted',
    $or: [
      { senderId: a, receiverId: b },
      { senderId: b, receiverId: a },
    ],
  });
  return !!found;
};