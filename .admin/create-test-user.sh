#!/bin/bash

USER_POOL_ID="eu-central-1_NouQsB2BF"
TEMP_PASSWORD="TempPass123!"

echo "Creating 2 test user accounts..."

for i in {1..2}; do
  EMAIL="testuser${i}@hlekkr.com"
  USERNAME="testuser${i}"
  
  aws cognito-idp admin-create-user \
    --user-pool-id $USER_POOL_ID \
    --username $USERNAME \
    --user-attributes Name=email,Value=$EMAIL Name=given_name,Value=Test Name=family_name,Value=User$i Name=custom:role,Value=user \
    --temporary-password $TEMP_PASSWORD \
    --message-action SUPPRESS
  
  echo "Created: $USERNAME ($EMAIL)"
done

echo ""
echo "=== TEST ACCOUNTS CREATED ==="
echo "Accounts: testuser1@hlekkr.com and testuser2@hlekkr.com"
echo "Password: $TEMP_PASSWORD"
echo "Role: moderator"
echo "Valid until: October 21, 2025"
echo "User Pool: $USER_POOL_ID"