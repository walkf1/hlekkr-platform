#!/bin/bash

# Deploy API Infrastructure Script
# Deploys the enhanced API Gateway infrastructure with all supporting components

set -e

# Configuration
STACK_NAME="hlekkr-api-infrastructure"
REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-development}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check CDK
    if ! command -v cdk &> /dev/null; then
        log_error "AWS CDK is not installed"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check TypeScript
    if ! command -v tsc &> /dev/null; then
        log_warning "TypeScript is not installed globally, using local version"
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials are not configured"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    # Install CDK dependencies
    npm install
    
    # Install Lambda dependencies
    for lambda_dir in lambda/*/; do
        if [ -f "${lambda_dir}package.json" ]; then
            log_info "Installing dependencies for ${lambda_dir}"
            (cd "${lambda_dir}" && npm install)
        fi
    done
    
    log_success "Dependencies installed"
}

# Build TypeScript code
build_code() {
    log_info "Building TypeScript code..."
    
    # Build CDK code
    npm run build
    
    # Build Lambda functions
    for lambda_dir in lambda/*/; do
        if [ -f "${lambda_dir}tsconfig.json" ]; then
            log_info "Building TypeScript for ${lambda_dir}"
            (cd "${lambda_dir}" && npx tsc)
        fi
    done
    
    log_success "Code built successfully"
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    # Run CDK tests
    if [ -f "package.json" ] && grep -q "test" package.json; then
        npm test
    fi
    
    # Run Lambda function tests
    for lambda_dir in lambda/*/; do
        if [ -f "${lambda_dir}package.json" ] && grep -q "test" "${lambda_dir}package.json"; then
            log_info "Running tests for ${lambda_dir}"
            (cd "${lambda_dir}" && npm test)
        fi
    done
    
    log_success "Tests completed"
}

# Validate CloudFormation templates
validate_templates() {
    log_info "Validating CloudFormation templates..."
    
    # Synthesize CDK templates
    cdk synth --all
    
    # Validate generated templates
    for template in cdk.out/*.template.json; do
        if [ -f "$template" ]; then
            log_info "Validating $(basename "$template")"
            aws cloudformation validate-template --template-body file://"$template" > /dev/null
        fi
    done
    
    log_success "Templates validated successfully"
}

# Deploy infrastructure
deploy_infrastructure() {
    log_info "Deploying infrastructure..."
    
    # Bootstrap CDK if needed
    cdk bootstrap aws://${ACCOUNT_ID}/${REGION}
    
    # Deploy stacks
    cdk deploy --all \
        --require-approval never \
        --context environment=${ENVIRONMENT} \
        --context region=${REGION} \
        --outputs-file outputs.json
    
    log_success "Infrastructure deployed successfully"
}

# Create API documentation
create_documentation() {
    log_info "Creating API documentation..."
    
    # Generate OpenAPI documentation
    if command -v swagger-codegen &> /dev/null; then
        swagger-codegen generate \
            -i lambda/api/openapi-spec.yaml \
            -l html2 \
            -o docs/api
        log_success "API documentation generated in docs/api/"
    else
        log_warning "swagger-codegen not found, skipping documentation generation"
    fi
}

# Setup monitoring and alerts
setup_monitoring() {
    log_info "Setting up monitoring and alerts..."
    
    # Create CloudWatch dashboards
    aws cloudwatch put-dashboard \
        --dashboard-name "Hlekkr-API-${ENVIRONMENT}" \
        --dashboard-body file://monitoring/dashboard.json \
        --region ${REGION} || log_warning "Failed to create dashboard"
    
    # Create CloudWatch alarms
    if [ -f "monitoring/alarms.json" ]; then
        while IFS= read -r alarm; do
            aws cloudwatch put-metric-alarm \
                --cli-input-json "$alarm" \
                --region ${REGION} || log_warning "Failed to create alarm"
        done < monitoring/alarms.json
    fi
    
    log_success "Monitoring setup completed"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Get API Gateway URL from outputs
    if [ -f "outputs.json" ]; then
        API_URL=$(jq -r '.HlekkrApiStack.ApiGatewayUrl // empty' outputs.json)
        
        if [ -n "$API_URL" ]; then
            log_info "Testing API health endpoint..."
            
            # Test health endpoint
            if curl -f -s "${API_URL}/health" > /dev/null; then
                log_success "API health check passed"
            else
                log_error "API health check failed"
                exit 1
            fi
        else
            log_warning "API Gateway URL not found in outputs"
        fi
    fi
    
    log_success "Deployment verification completed"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    
    # Remove build artifacts
    rm -rf cdk.out/
    rm -f outputs.json
    
    # Clean Lambda build artifacts
    find lambda/ -name "*.js" -type f -delete
    find lambda/ -name "*.js.map" -type f -delete
    find lambda/ -name "*.d.ts" -type f -delete
    
    log_success "Cleanup completed"
}

# Main deployment function
main() {
    log_info "Starting API infrastructure deployment..."
    log_info "Environment: ${ENVIRONMENT}"
    log_info "Region: ${REGION}"
    log_info "Account: ${ACCOUNT_ID}"
    
    # Set error handling
    trap cleanup EXIT
    
    # Run deployment steps
    check_prerequisites
    install_dependencies
    build_code
    
    # Skip tests in CI/CD if requested
    if [ "${SKIP_TESTS:-false}" != "true" ]; then
        run_tests
    fi
    
    validate_templates
    deploy_infrastructure
    create_documentation
    setup_monitoring
    verify_deployment
    
    log_success "API infrastructure deployment completed successfully!"
    
    # Display important information
    if [ -f "outputs.json" ]; then
        echo ""
        log_info "Deployment Outputs:"
        jq -r 'to_entries[] | "\(.key): \(.value)"' outputs.json
    fi
    
    echo ""
    log_info "Next steps:"
    echo "1. Configure DNS records if needed"
    echo "2. Set up CI/CD pipelines"
    echo "3. Configure monitoring alerts"
    echo "4. Update client applications with new API endpoints"
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "destroy")
        log_warning "Destroying infrastructure..."
        cdk destroy --all --force
        log_success "Infrastructure destroyed"
        ;;
    "diff")
        log_info "Showing infrastructure diff..."
        cdk diff --all
        ;;
    "synth")
        log_info "Synthesizing CloudFormation templates..."
        cdk synth --all
        ;;
    "test")
        check_prerequisites
        install_dependencies
        build_code
        run_tests
        ;;
    "docs")
        create_documentation
        ;;
    "validate")
        check_prerequisites
        install_dependencies
        build_code
        validate_templates
        ;;
    *)
        echo "Usage: $0 {deploy|destroy|diff|synth|test|docs|validate}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Deploy the complete infrastructure (default)"
        echo "  destroy  - Destroy all infrastructure"
        echo "  diff     - Show differences between current and deployed state"
        echo "  synth    - Synthesize CloudFormation templates"
        echo "  test     - Run tests only"
        echo "  docs     - Generate API documentation"
        echo "  validate - Validate templates without deploying"
        echo ""
        echo "Environment variables:"
        echo "  ENVIRONMENT - Deployment environment (default: development)"
        echo "  AWS_REGION  - AWS region (default: us-east-1)"
        echo "  SKIP_TESTS  - Skip running tests (default: false)"
        exit 1
        ;;
esac