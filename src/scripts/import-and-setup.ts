import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../services/auth.service';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import * as fs from 'fs';
import * as path from 'path';

interface MemberData {
  fullName: string;
  studentId: string;
  birthDate: string;
}

async function importAndSetup() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);
  const logger = new Logger('ImportAndSetup');

  try {
    // Step 1: Import members data
    logger.log('🚀 Starting combined import and setup process...');
    
    const membersPath = path.join(process.cwd(), 'members-list-final.json');
    
    if (!fs.existsSync(membersPath)) {
      logger.error(`Members file not found: ${membersPath}`);
      return;
    }

    const membersData: MemberData[] = JSON.parse(fs.readFileSync(membersPath, 'utf8'));

    logger.log(`📥 Found ${membersData.length} members to import...`);
    logger.log(`📁 File: ${membersPath}`);

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    // Process in batches for better performance
    const batchSize = 50;
    const batches = [];
    
    for (let i = 0; i < membersData.length; i += batchSize) {
      batches.push(membersData.slice(i, i + batchSize));
    }

    console.log(`📦 Processing ${batches.length} batches of ${batchSize} users each...\n`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length}...`);

      for (const member of batch) {
        try {
          // Validate member data
          if (!member.studentId || !member.fullName || !member.birthDate) {
            console.log(`⚠️  Invalid data for member: ${JSON.stringify(member)}`);
            failed++;
            continue;
          }

          // Check if user already exists
          const existingUser = await authService.getUserByStudentId(member.studentId);
          
          if (existingUser) {
            console.log(`⏭️  User ${member.studentId} already exists, skipping...`);
            skipped++;
            continue;
          }

          // Create new user with hashed password
          await authService.createUser(
            member.studentId.trim(),
            member.fullName.trim(),
            member.birthDate.trim()
          );

          console.log(`✅ Imported: ${member.fullName} (${member.studentId})`);
          imported++;

        } catch (error) {
          console.error(`❌ Error importing ${member.studentId}:`, error.message);
          failed++;
        }
      }

      // Small delay between batches to avoid overwhelming the database
      if (batchIndex < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`✅ Successfully imported: ${imported} users`);
    console.log(`⏭️  Skipped (already exists): ${skipped} users`);
    console.log(`❌ Failed to import: ${failed} users`);
    console.log(`📈 Total processed: ${imported + skipped + failed}/${membersData.length} users`);
    
    if (imported > 0) {
      console.log(`\n🎉 Members import completed successfully!`);
    } else {
      console.log(`\n✨ All members already exist in database`);
    }

    // Step 2: Create admin user
    console.log('\n👑 Creating admin user...');
    
    // Admin user data
    const adminData = {
      studentId: 'admin001',
      fullName: 'System Administrator',
      birthDate: '01/01/2000', // Default admin password
      role: 'admin'
    };

    // Check if admin already exists
    const existingAdmin = await authService.getUserByStudentId(adminData.studentId);
    if (existingAdmin) {
      console.log(`✅ Admin user ${adminData.studentId} already exists!`);
      
      // Update role if needed
      const userModel = app.get('UserModel') as Model<UserDocument>;
      await userModel.updateOne(
        { studentId: adminData.studentId },
        { role: 'admin' }
      );
      console.log('🔄 Updated role to admin');
      
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
    console.log('\n💡 Users can login with their studentId and birthDate (DDMMYY format)');
    console.log('🎯 You can now login with admin credentials to access admin dashboard.');

  } catch (error) {
    console.error('💥 Setup failed with error:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  } finally {
    await app.close();
    console.log('\n🔌 Application context closed');
  }
}

// Enhanced error handling and logging
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// Run the import with better error handling
console.log('🚀 Starting combined import and setup process...');
console.log(`⏰ Started at: ${new Date().toISOString()}`);

importAndSetup()
  .then(() => {
    console.log(`✅ Setup process completed at: ${new Date().toISOString()}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup process failed:', error);
    process.exit(1);
  });
