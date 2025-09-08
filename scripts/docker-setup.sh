#!/bin/sh
set -e

echo "🚀 Starting Docker setup for Stream Socket..."

# Wait for MongoDB to be ready
echo "⏳ Waiting for MongoDB connection..."
until nc -z mongodb 27017; do
    sleep 2
done
echo "  ✅ MongoDB is ready!"

# Import members data
echo "📥 Importing members data..."
if node dist/scripts/import-members.js; then
    echo "  ✅ Members imported successfully!"
else
    echo "  ❌ Failed to import members"
fi

# Create admin user
echo "👑 Creating admin user..."
if node dist/scripts/create-admin.js; then
    echo "  ✅ Admin user created successfully!"
else
    echo "  ❌ Failed to create admin user"
fi

echo "✅ Setup completed successfully!"

# Start the main application
echo "🚀 Starting application..."
exec "$@"
