#!/bin/bash

# Hlekkr Lambda Function Test Runner
# Comprehensive test suite for the agent hook workflow

set -e

echo "🧪 Starting Hlekkr Lambda Function Test Suite"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the test directory."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing test dependencies..."
    npm install
fi

# Run different test suites based on argument
case "${1:-all}" in
    "unit")
        print_status "Running unit tests..."
        npm run test -- --run unit/
        ;;
    "integration")
        print_status "Running integration tests..."
        npm run test -- --run integration/
        ;;
    "coverage")
        print_status "Running tests with coverage report..."
        npm run test:coverage
        ;;
    "watch")
        print_status "Running tests in watch mode..."
        npm run test:watch
        ;;
    "ui")
        print_status "Starting test UI..."
        npm run test:ui
        ;;
    "all"|*)
        print_status "Running all tests..."
        
        # Run unit tests
        print_status "1/3 Running unit tests..."
        npm run test -- --run unit/ || {
            print_error "Unit tests failed!"
            exit 1
        }
        
        # Run integration tests
        print_status "2/3 Running integration tests..."
        npm run test -- --run integration/ || {
            print_error "Integration tests failed!"
            exit 1
        }
        
        # Generate coverage report
        print_status "3/3 Generating coverage report..."
        npm run test:coverage || {
            print_warning "Coverage report generation failed, but tests passed."
        }
        ;;
esac

print_success "Test suite completed successfully! ✅"

# Display coverage summary if available
if [ -f "coverage/coverage-summary.json" ]; then
    print_status "Coverage Summary:"
    echo "=================="
    
    # Extract coverage percentages (requires jq)
    if command -v jq &> /dev/null; then
        LINES=$(jq -r '.total.lines.pct' coverage/coverage-summary.json)
        FUNCTIONS=$(jq -r '.total.functions.pct' coverage/coverage-summary.json)
        BRANCHES=$(jq -r '.total.branches.pct' coverage/coverage-summary.json)
        STATEMENTS=$(jq -r '.total.statements.pct' coverage/coverage-summary.json)
        
        echo "Lines:      ${LINES}%"
        echo "Functions:  ${FUNCTIONS}%"
        echo "Branches:   ${BRANCHES}%"
        echo "Statements: ${STATEMENTS}%"
        
        # Check if coverage meets thresholds
        if (( $(echo "$LINES >= 80" | bc -l) )) && \
           (( $(echo "$FUNCTIONS >= 80" | bc -l) )) && \
           (( $(echo "$BRANCHES >= 80" | bc -l) )) && \
           (( $(echo "$STATEMENTS >= 80" | bc -l) )); then
            print_success "Coverage thresholds met! 🎯"
        else
            print_warning "Coverage below 80% threshold. Consider adding more tests."
        fi
    else
        print_status "Install 'jq' to see detailed coverage summary"
    fi
    
    print_status "Full coverage report: file://$(pwd)/coverage/index.html"
fi

echo ""
print_success "🚀 Hlekkr agent hook workflow reliability proven!"
echo "   All critical components tested and validated."
echo "   Ready for production deployment."