#!/bin/bash

# One-time setup script for shortlinks DynamoDB table in GovCloud
# Account ID: 461760157232

echo "========================================="
echo "GHOST Dashboard - Shortlinks Table Setup"
echo "========================================="
echo ""
echo "This script will create the DynamoDB table for shortlinks in AWS GovCloud"
echo "Region: us-gov-west-1"
echo "Table: ghost-dashboard-shortlinks"
echo ""

# Check for required environment variables
if [ -z "$AWS_GOVCLOUD_ACCESS_KEY_ID" ] || [ -z "$AWS_GOVCLOUD_SECRET_ACCESS_KEY" ]; then
    echo "⚠️  AWS GovCloud credentials not found"
    echo "   Loading from .env file..."
    
    # Load .env file if it exists
    if [ -f .env ]; then
        export $(grep -E '^AWS_GOVCLOUD_' .env | xargs)
        echo "✅ Credentials loaded from .env"
    else
        echo "❌ .env file not found. Please ensure AWS_GOVCLOUD_ACCESS_KEY_ID and AWS_GOVCLOUD_SECRET_ACCESS_KEY are set"
        exit 1
    fi
fi

echo "✅ Using GovCloud credentials from environment"
echo ""

# Prompt for confirmation
read -p "Do you want to proceed with table creation? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Setup cancelled"
    exit 1
fi

echo ""
echo "🚀 Starting setup..."
echo ""

# Run the Node.js script
node scripts/create-shortlinks-table.js

echo ""
echo "========================================="
echo "Setup process completed!"
echo "========================================="