import { ConfigService } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';

export const getDatabaseConfig = (
  configService: ConfigService,
): MongooseModuleOptions => {
  // Support both DATABASE_URL and MONGODB_URI for flexibility
  const uri = 
    configService.get<string>('DATABASE_URL') ||
    configService.get<string>('MONGODB_URI') || 
    'mongodb://localhost:27017/stream_socket';

  console.log('🔌 Database URI:', uri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in logs

  return {
    uri,
    maxPoolSize: 50, // Maintain up to 50 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    // Recommended settings for production
    retryWrites: true,
    heartbeatFrequencyMS: 10000, // How often to check if connection is still alive
    maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
    connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
  };
};
