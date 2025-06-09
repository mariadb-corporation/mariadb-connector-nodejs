#!/bin/bash

# // SPDX-License-Identifier: LGPL-2.1-or-later
# // Copyright (c) 2015-2025 MariaDB Corporation Ab

# Script to generate self-signed certificates for testing
# CN: mariadb.example.com

set -e

echo "Generating self-signed certificates for mariadb.example.com..."

# Create directory for certificates
mkdir -p .github/workflows/certs

echo "Generate CA private key"
openssl genrsa 2048 > .github/workflows/certs/ca.key

echo "[ req ]" > .github/workflows/certs/ca.conf
echo "prompt                 = no" >> .github/workflows/certs/ca.conf
echo "distinguished_name     = req_distinguished_name" >> .github/workflows/certs/ca.conf
echo "" >> .github/workflows/certs/ca.conf
echo "[ req_distinguished_name ]" >> .github/workflows/certs/ca.conf
echo "countryName            = FR" >> .github/workflows/certs/ca.conf
echo "stateOrProvinceName    = Loire-atlantique" >> .github/workflows/certs/ca.conf
echo "localityName           = Nantes" >> .github/workflows/certs/ca.conf
echo "organizationName       = Home" >> .github/workflows/certs/ca.conf
echo "organizationalUnitName = Lab" >> .github/workflows/certs/ca.conf
echo "commonName             = mariadb.example.com" >> .github/workflows/certs/ca.conf
echo "emailAddress           = admin@mariadb.example.com" >> .github/workflows/certs/ca.conf

echo "Generate CA certificate (self-signed)"
openssl req -days 365 -new -x509 -nodes -key .github/workflows/certs/ca.key -out .github/workflows/certs/ca.crt --config .github/workflows/certs/ca.conf



echo "[ req ]" > .github/workflows/certs/server.conf
echo "prompt                 = no" >> .github/workflows/certs/server.conf
echo "distinguished_name     = req_distinguished_name" >> .github/workflows/certs/server.conf
echo "req_extensions         = req_ext" >> .github/workflows/certs/server.conf
echo "" >> .github/workflows/certs/server.conf
echo "[ req_distinguished_name ]" >> .github/workflows/certs/server.conf
echo "countryName            = FR" >> .github/workflows/certs/server.conf
echo "stateOrProvinceName    = Loire-atlantique" >> .github/workflows/certs/server.conf
echo "localityName           = Nantes" >> .github/workflows/certs/server.conf
echo "organizationName       = Home" >> .github/workflows/certs/server.conf
echo "organizationalUnitName = Lab" >> .github/workflows/certs/server.conf
echo "commonName             = mariadb.example.com" >> .github/workflows/certs/server.conf
echo "emailAddress           = admin@mariadb.example.com" >> .github/workflows/certs/server.conf
echo "" >> .github/workflows/certs/server.conf
echo "[ req_ext ]" >> .github/workflows/certs/server.conf
echo "subjectAltName = DNS: mariadb.example.com, IP: 127.0.0.1" >> .github/workflows/certs/server.conf


echo "Generating private key..."
openssl genrsa -out .github/workflows/certs/server.key 2048

echo "Generating certificate signing request..."
openssl req -new -key .github/workflows/certs/server.key -out .github/workflows/certs/server.csr --config .github/workflows/certs/server.conf


echo "Generate the certificate for the server:"
openssl x509 -req -days 365 -in .github/workflows/certs/server.csr -out .github/workflows/certs/server.crt -CA .github/workflows/certs/ca.crt -CAkey .github/workflows/certs/ca.key -extensions req_ext -extfile .github/workflows/certs/server.conf

# Set appropriate permissions
chmod 600 .github/workflows/certs/ca.key
chmod 644 .github/workflows/certs/server.crt .github/workflows/certs/ca.crt .github/workflows/certs/server.key

# List generated certificates
echo "Generated certificates:"
ls -la .github/workflows/certs/

# Verify certificate
echo "Certificate details:"
openssl x509 -in .github/workflows/certs/server.crt -text -noout | grep -E "(Subject|CN)"

echo "Certificate generation completed successfully!"