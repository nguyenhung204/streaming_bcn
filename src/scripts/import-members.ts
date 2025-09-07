import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../services/auth.service';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';

interface MemberData {
  fullName: string;
  studentId: string;
  birthDate: string;
}

async function hashPassword(plainPassword: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(plainPassword, saltRounds);
}

async function importMembers() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);

  try {
    // Read members data
    const membersPath = path.join(process.cwd(), 'members-list-final.json');
    
    if (!fs.existsSync(membersPath)) {
      console.error(`❌ Members file not found: ${membersPath}`);
      return;
    }

    const membersData: MemberData[] = JSON.parse(fs.readFileSync(membersPath, 'utf8'));

    console.log(`🔍 Found ${membersData.length} members to import...`);
    console.log(`📁 File: ${membersPath}`);

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
      console.log(`\n🎉 Import completed successfully!`);
      console.log(`💡 Users can now login with their studentId and birthDate (DDMMYY format)`);
    }

  } catch (error) {
    console.error('💥 Import failed with error:', error);
    console.error('Stack trace:', error.stack);
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
console.log('🚀 Starting members import process...');
console.log(`⏰ Started at: ${new Date().toISOString()}`);

importMembers()
  .then(() => {
    console.log(`✅ Import process completed at: ${new Date().toISOString()}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Import process failed:', error);
    process.exit(1);
  });
