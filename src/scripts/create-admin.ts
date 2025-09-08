import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../services/auth.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

async function createAdminUser() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  try {
    const authService = app.get(AuthService);
    
    // Admin user data
    const adminData = {
      studentId: 'admin001',
      fullName: 'System Administrator',
      birthDate: '01/01/2000', // Default admin password
      role: 'admin'
    };

    console.log('Creating admin user...');
    
    // Check if admin already exists
    const existingAdmin = await authService.getUserByStudentId(adminData.studentId);
    if (existingAdmin) {
      console.log(`Admin user ${adminData.studentId} already exists!`);
      
      // Update role if needed
      const userModel = app.get('UserModel') as Model<UserDocument>;
      await userModel.updateOne(
        { studentId: adminData.studentId },
        { role: 'admin' }
      );
      console.log('Updated role to admin');
      
    } else {
      // Create new admin user
      const hashedPassword = await authService.hashPassword(adminData.birthDate);
      
      const userModel = app.get('UserModel') as Model<UserDocument>;
      const adminUser = new userModel({
        studentId: adminData.studentId,
        fullName: adminData.fullName,
        hashedPassword: hashedPassword,
        role: 'admin',
        isActive: true,
        loginCount: 0,
      });

      await adminUser.save();
      console.log('✅ Admin user created successfully!');
    }

    console.log('\n📋 Admin Login Credentials:');
    console.log(`👤 Student ID: ${adminData.studentId}`);
    console.log(`🔑 Password (Birth Date): ${adminData.birthDate}`);
    console.log(`🎯 Role: admin`);
    console.log('\nYou can now login with these credentials to access admin dashboard.');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await app.close();
  }
}

// Run the script
createAdminUser();
