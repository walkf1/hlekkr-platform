#!/bin/bash
set -e

# Build ClamAV layer
docker build -t clamav-layer .
docker run --rm -v $(pwd):/output clamav-layer cp -r /opt /output/

# Create layer zip
cd opt
zip -r ../clamav-layer.zip .
cd ..
rm -rf opt

echo "ClamAV layer built: clamav-layer.zip"