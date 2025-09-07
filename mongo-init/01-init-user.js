// MongoDB initialization script
// This runs when the container starts for the first time

print('Initializing MongoDB for LiveStream Chat Application...');

// Switch to admin database first to create root user
db = db.getSiblingDB('admin');

// Create root admin user
db.createUser({
  user: 'admin',
  pwd: 'StreamSocket2025!',
  roles: [
    {
      role: 'root',
      db: 'admin'
    }
  ]
});

print('Admin user created successfully!');

// Switch to the application database
db = db.getSiblingDB('stream_socket');

// Create application user with read/write permissions
db.createUser({
  user: 'app_user',
  pwd: 'app_password_123',
  roles: [
    {
      role: 'readWrite',
      db: 'stream_socket'
    }
  ]
});

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['studentId', 'fullName', 'hashedPassword'],
      properties: {
        studentId: {
          bsonType: 'string',
          description: 'Student ID must be a string and is required'
        },
        fullName: {
          bsonType: 'string',
          description: 'Full name must be a string and is required'
        },
        hashedPassword: {
          bsonType: 'string',
          description: 'Hashed password must be a string and is required'
        },
        lastLogin: {
          bsonType: 'date',
          description: 'Last login must be a date'
        },
        isActive: {
          bsonType: 'bool',
          description: 'Active status must be a boolean'
        },
        loginCount: {
          bsonType: 'int',
          description: 'Login count must be an integer'
        }
      }
    }
  }
});

db.createCollection('live_rooms', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['roomId', 'title', 'hostId', 'hostName'],
      properties: {
        roomId: {
          bsonType: 'string',
          description: 'Room ID must be a string and is required'
        },
        title: {
          bsonType: 'string',
          description: 'Title must be a string and is required'
        },
        hostId: {
          bsonType: 'string',
          description: 'Host ID must be a string and is required'
        },
        hostName: {
          bsonType: 'string',
          description: 'Host name must be a string and is required'
        },
        viewerCount: {
          bsonType: 'int',
          description: 'Viewer count must be an integer'
        },
        isActive: {
          bsonType: 'bool',
          description: 'Active status must be a boolean'
        }
      }
    }
  }
});

db.createCollection('chat_messages', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['roomId', 'userId', 'username', 'message'],
      properties: {
        roomId: {
          bsonType: 'string',
          description: 'Room ID must be a string and is required'
        },
        userId: {
          bsonType: 'string',
          description: 'User ID must be a string and is required'
        },
        username: {
          bsonType: 'string',
          description: 'Username must be a string and is required'
        },
        message: {
          bsonType: 'string',
          maxLength: 500,
          description: 'Message must be a string with max 500 characters and is required'
        },
        type: {
          enum: ['text', 'emoji', 'system'],
          description: 'Message type must be text, emoji, or system'
        }
      }
    }
  }
});

// Create indexes for better performance
db.users.createIndex({ studentId: 1 }, { unique: true });
db.users.createIndex({ isActive: 1 });

db.live_rooms.createIndex({ roomId: 1 }, { unique: true });
db.live_rooms.createIndex({ isActive: 1 });
db.live_rooms.createIndex({ hostId: 1 });

db.chat_messages.createIndex({ roomId: 1, timestamp: -1 });
db.chat_messages.createIndex({ userId: 1, timestamp: -1 });
db.chat_messages.createIndex({ timestamp: -1 });

print('MongoDB initialization completed successfully!');
