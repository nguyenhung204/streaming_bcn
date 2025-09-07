// MongoDB initialization script
// This script runs when MongoDB container starts for the first time

print('🚀 Initializing MongoDB database...');

// Switch to our database
db = db.getSiblingDB('stream_socket');

// Create users collection with proper indexes
db.createCollection('users');
db.users.createIndex({ "studentId": 1 }, { unique: true });
db.users.createIndex({ "isActive": 1 });

// Create live_rooms collection with indexes
db.createCollection('live_rooms');
db.live_rooms.createIndex({ "roomId": 1 }, { unique: true });
db.live_rooms.createIndex({ "isActive": 1 });
db.live_rooms.createIndex({ "hostId": 1 });

// Create chat_messages collection with indexes
db.createCollection('chat_messages');
db.chat_messages.createIndex({ "roomId": 1, "timestamp": -1 });
db.chat_messages.createIndex({ "userId": 1, "timestamp": -1 });
db.chat_messages.createIndex({ "timestamp": -1 });

print('✅ Database collections and indexes created successfully');

// Create admin user for testing
db.users.insertOne({
  studentId: "admin123",
  fullName: "System Administrator",
  hashedPassword: "$2b$10$8K1p.aQKlKJhGGsKJhGGsKJhGGsKJhGGsKJhGGsKJhGGsKJhGGsK", // hashed "admin123"
  lastLogin: new Date(),
  isActive: true,
  loginCount: 0,
  createdAt: new Date(),
  updatedAt: new Date()
});

// Create a test room
db.live_rooms.insertOne({
  roomId: "welcome-room",
  title: "🎉 Phòng chào mừng",
  hostId: "admin123",
  hostName: "System Administrator",
  viewerCount: 0,
  isActive: true,
  startTime: new Date(),
  settings: {
    maxChatLength: 500,
    slowMode: 0,
    moderatorMode: false,
    allowGuests: true,
    category: "welcome"
  },
  createdAt: new Date(),
  updatedAt: new Date()
});

print('✅ Sample data inserted successfully');
print('🎯 MongoDB initialization completed!');
