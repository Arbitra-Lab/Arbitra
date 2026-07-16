-- backend/src/database/migrations/001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- USERS & AUTHENTICATION
-- =====================================================

CREATE TYPE user_role AS ENUM ('landlord', 'tenant', 'agent', 'admin');
CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended', 'deactivated');
CREATE TYPE kyc_status AS ENUM ('not_started', 'pending', 'approved', 'rejected');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    status user_status DEFAULT 'pending',
    
    -- Stellar integration
    stellar_public_key VARCHAR(56) UNIQUE,
    stellar_account_created BOOLEAN DEFAULT FALSE,
    
    -- Profile
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20),
    profile_image_url TEXT,
    
    -- Verification
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    kyc_status kyc_status DEFAULT 'not_started',
    
    -- Authentication & Security
    refresh_token VARCHAR(512),
    password_reset_token VARCHAR(255),
    reset_token_expires_at TIMESTAMP WITH TIME ZONE,
    account_locked BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stellar_public_key ON users(stellar_public_key);
CREATE INDEX idx_users_role_status ON users(role, status);

-- =====================================================
-- LANDLORD PROFILES
-- =====================================================

CREATE TABLE landlord_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Business information
    company_name VARCHAR(255),
    business_registration_number VARCHAR(100),
    tax_id VARCHAR(100),
    
    -- Contact
    business_street VARCHAR(255),
    business_unit VARCHAR(50),
    business_city VARCHAR(100),
    business_state VARCHAR(100),
    business_postal_code VARCHAR(20),
    business_country VARCHAR(100),
    business_latitude DECIMAL(10, 8),
    business_longitude DECIMAL(11, 8),
    business_phone_number VARCHAR(20),
    business_email VARCHAR(255),
    
    -- Stats
    total_properties INTEGER DEFAULT 0,
    active_rentals INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2),
    total_reviews INTEGER DEFAULT 0,
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_landlord_profiles_user_id ON landlord_profiles(user_id);

-- =====================================================
-- TENANT PROFILES
-- =====================================================

CREATE TYPE employment_status AS ENUM ('employed', 'self_employed', 'unemployed', 'student', 'retired');

CREATE TABLE tenant_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Employment
    employment_status employment_status,
    employer VARCHAR(255),
    monthly_income DECIMAL(15, 2),
    
    -- Previous address
    previous_street VARCHAR(255),
    previous_unit VARCHAR(50),
    previous_city VARCHAR(100),
    previous_state VARCHAR(100),
    previous_postal_code VARCHAR(20),
    previous_country VARCHAR(100),
    years_of_rental_history INTEGER,
    
    -- Stats
    active_leases INTEGER DEFAULT 0,
    total_leases_completed INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tenant_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_profile_id UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
    relationship VARCHAR(50) NOT NULL CHECK (relationship IN ('previous_landlord', 'employer', 'personal')),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone_number VARCHAR(20),
    notes TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tenant_profiles_user_id ON tenant_profiles(user_id);
CREATE INDEX idx_tenant_references_profile_id ON tenant_references(tenant_profile_id);

-- =====================================================
-- AGENT PROFILES
-- =====================================================

CREATE TABLE agent_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Business
    agency_name VARCHAR(255),
    license_number VARCHAR(100),
    license_expiry TIMESTAMP WITH TIME ZONE,
    
    -- Service area (stored as JSONB array)
    service_areas JSONB DEFAULT '[]',
    specializations JSONB DEFAULT '[]',
    
    -- Commission
    default_commission_rate DECIMAL(5, 2) NOT NULL, -- e.g., 10.50 for 10.5%
    
    -- Stats
    total_deals INTEGER DEFAULT 0,
    active_listings INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2),
    total_reviews INTEGER DEFAULT 0,
    
    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_profiles_user_id ON agent_profiles(user_id);

-- =====================================================
-- PROPERTIES
-- =====================================================

CREATE TYPE property_type AS ENUM ('apartment', 'house', 'condo', 'townhouse', 'studio', 'commercial');
CREATE TYPE property_status AS ENUM ('draft', 'active', 'rented', 'maintenance', 'inactive');
CREATE TYPE furnishing_status AS ENUM ('furnished', 'semi_furnished', 'unfurnished');
CREATE TYPE parking_type AS ENUM ('none', 'street', 'garage', 'covered', 'open');

CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    landlord_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Stellar integration
    landlord_stellar_pub_key VARCHAR(56),
    
    -- Basic information
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    property_type property_type NOT NULL,
    
    -- Location
    street VARCHAR(255) NOT NULL,
    unit VARCHAR(50),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Details
    bedrooms INTEGER NOT NULL,
    bathrooms INTEGER NOT NULL,
    half_bathrooms INTEGER DEFAULT 0,
    sqft INTEGER NOT NULL,
    year_built INTEGER,
    
    -- Features
    furnishing_status furnishing_status NOT NULL,
    parking parking_type DEFAULT 'none',
    parking_spaces INTEGER DEFAULT 0,
    amenities JSONB DEFAULT '[]', -- Array of amenity strings
    
    -- Financial
    monthly_rent DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    security_deposit_months INTEGER NOT NULL DEFAULT 1,
    security_deposit_amount DECIMAL(15, 2) GENERATED ALWAYS AS (monthly_rent * security_deposit_months) STORED,
    utilities_included JSONB DEFAULT '[]', -- Array of utility strings
    
    -- Lease terms
    minimum_lease_term INTEGER NOT NULL, -- in months
    maximum_lease_term INTEGER,
    available_from TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Media (URLs stored, actual files in S3/CloudStorage)
    virtual_tour_url TEXT,
    
    -- Status
    status property_status DEFAULT 'draft',
    featured BOOLEAN DEFAULT FALSE,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    
    -- Stats
    views INTEGER DEFAULT 0,
    inquiries INTEGER DEFAULT 0,
    applications INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_properties_landlord_id ON properties(landlord_id);
CREATE INDEX idx_properties_agent_id ON properties(agent_id);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_location ON properties(city, state, country);

-- =====================================================
-- PROPERTY MEDIA
-- =====================================================

CREATE TABLE property_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    caption TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE property_videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    duration INTEGER, -- in seconds
    caption TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE property_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('inspection_report', 'floor_plan', 'certificate', 'other')),
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    file_size BIGINT NOT NULL, -- in bytes
    mime_type VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_property_media ON property_images(property_id);
CREATE INDEX idx_property_videos ON property_videos(property_id);
CREATE INDEX idx_property_documents ON property_documents(property_id);

-- =====================================================
-- RENT AGREEMENTS
-- =====================================================

CREATE TYPE agreement_status AS ENUM ('draft', 'pending_deposit', 'active', 'expired', 'terminated', 'disputed');
CREATE TYPE termination_reason AS ENUM ('lease_end', 'early_termination_tenant', 'early_termination_landlord', 'eviction', 'mutual_agreement');
CREATE TYPE payment_frequency AS ENUM ('monthly', 'quarterly', 'semi_annual', 'annual');

CREATE TABLE rent_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Parties
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    landlord_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Stellar accounts
    landlord_stellar_pub_key VARCHAR(56) NOT NULL,
    tenant_stellar_pub_key VARCHAR(56) NOT NULL,
    agent_stellar_pub_key VARCHAR(56),
    escrow_account_pub_key VARCHAR(56),
    
    -- Financial terms
    monthly_rent DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    security_deposit DECIMAL(15, 2) NOT NULL,
    agent_commission_rate DECIMAL(5, 2) NOT NULL, -- Percentage
    agent_commission_amount DECIMAL(15, 2) NOT NULL,
    payment_frequency payment_frequency NOT NULL,
    
    -- Payment tracking
    first_payment_due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    last_payment_date TIMESTAMP WITH TIME ZONE,
    total_payments_made INTEGER DEFAULT 0,
    total_amount_paid DECIMAL(15, 2) DEFAULT 0,
    
    -- Stellar transaction references
    deposit_tx_hash VARCHAR(64),
    deposit_paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Lease terms
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    lease_duration_months INTEGER NOT NULL,
    renewal_option BOOLEAN DEFAULT FALSE,
    renewal_notice_days INTEGER,
    
    -- Terms and conditions
    terms_and_conditions TEXT NOT NULL,
    
    -- Status
    status agreement_status DEFAULT 'draft',
    
    -- Termination
    terminated_at TIMESTAMP WITH TIME ZONE,
    termination_reason termination_reason,
    termination_notes TEXT,
    
    -- Signatures
    landlord_signed_at TIMESTAMP WITH TIME ZONE,
    tenant_signed_at TIMESTAMP WITH TIME ZONE,
    agent_signed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE agreement_clauses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id UUID NOT NULL REFERENCES rent_agreements(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('pets', 'smoking', 'subletting', 'maintenance', 'custom')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    display_order INTEGER NOT NULL
);

CREATE INDEX idx_rent_agreements_property ON rent_agreements(property_id);
CREATE INDEX idx_rent_agreements_landlord ON rent_agreements(landlord_id);
CREATE INDEX idx_rent_agreements_tenant ON rent_agreements(tenant_id);
CREATE INDEX idx_rent_agreements_status ON rent_agreements(status);
CREATE INDEX idx_agreement_clauses ON agreement_clauses(agreement_id);

-- =====================================================
-- RENT PAYMENTS
-- =====================================================

CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'late', 'partial', 'failed');

CREATE TABLE rent_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id UUID NOT NULL REFERENCES rent_agreements(id) ON DELETE CASCADE,
    
    -- Payment details
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_date TIMESTAMP WITH TIME ZONE,
    
    -- Splits
    landlord_amount DECIMAL(15, 2) NOT NULL,
    agent_amount DECIMAL(15, 2) NOT NULL,
    
    -- Stellar transaction
    transaction_hash VARCHAR(64),
    
    -- Status
    status payment_status DEFAULT 'pending',
    late_fee DECIMAL(15, 2) DEFAULT 0,
    
    -- References
    payment_month INTEGER NOT NULL, -- 1-12
    payment_year INTEGER NOT NULL,
    payment_number INTEGER NOT NULL, -- Sequential number within agreement
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_payment_reference UNIQUE (agreement_id, payment_year, payment_number)
);

-- =====================================================
-- SECURITY DEPOSITS
-- =====================================================

CREATE TYPE deposit_status AS ENUM ('pending', 'held', 'released', 'disputed', 'returned');

CREATE TABLE security_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_id UUID NOT NULL REFERENCES rent_agreements(id) ON DELETE CASCADE,
    
    -- Deposit details
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    
    -- Stellar references
    escrow_account_pub_key VARCHAR(56) NOT NULL,
    deposit_tx_hash VARCHAR(64),
    release_tx_hash VARCHAR(64),
    
    -- Status
    status deposit_status DEFAULT 'pending',
    
    -- Release details
    release_amount DECIMAL(15, 2),
    deduction_amount DECIMAL(15, 2),
    deduction_reason TEXT,
    released_to VARCHAR(20) CHECK (released_to IN ('tenant', 'landlord', 'split')),
    
    -- Dates
    deposited_at TIMESTAMP WITH TIME ZONE,
    released_at TIMESTAMP WITH TIME ZONE,
    
    -- Dispute
    dispute_id UUID, -- Will reference disputes table
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- DISPUTES
-- =====================================================

CREATE TYPE dispute_type AS ENUM ('security_deposit', 'property_damage', 'lease_violation', 'payment', 'other');
CREATE TYPE dispute_status AS ENUM ('open', 'under_review', 'resolved', 'closed', 'escalated');

CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_number VARCHAR(50) UNIQUE NOT NULL,
    
    -- Related entities
    agreement_id UUID NOT NULL REFERENCES rent_agreements(id) ON DELETE CASCADE,
    security_deposit_id UUID REFERENCES security_deposits(id) ON DELETE SET NULL,
    
    -- Parties
    initiated_by VARCHAR(20) NOT NULL CHECK (initiated_by IN ('tenant', 'landlord')),
    initiator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    respondent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Dispute details
    type dispute_type NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requested_amount DECIMAL(15, 2),
    
    -- Status
    status dispute_status DEFAULT 'open',
    
    -- Resolution
    resolution TEXT,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL, -- Admin or mediator ID
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dispute_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('document', 'image', 'video', 'message')),
    url TEXT NOT NULL,
    description TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_disputes_agreement ON disputes(agreement_id);
CREATE INDEX idx_disputes_initiator ON disputes(initiator_id);
CREATE INDEX idx_disputes_respondent ON disputes(respondent_id);
CREATE INDEX idx_dispute_evidence ON dispute_evidence(dispute_id);

-- =====================================================
-- TRANSACTIONS
-- =====================================================

CREATE TYPE transaction_type AS ENUM ('rent_payment', 'security_deposit', 'deposit_release', 'agent_commission', 'refund');

CREATE TABLE indexed_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Stellar transaction data
    transaction_hash VARCHAR(64) UNIQUE NOT NULL,
    ledger INTEGER NOT NULL,
    ledger_close_time TIMESTAMP WITH TIME ZONE NOT NULL,
    successful BOOLEAN NOT NULL,
    
    -- Transaction classification
    transaction_type transaction_type NOT NULL,
    
    -- Parties
    source_account VARCHAR(56) NOT NULL,
    destination_account VARCHAR(56),
    
    -- Financial details
    amount VARCHAR(100) NOT NULL,
    asset_code VARCHAR(12) NOT NULL,
    asset_issuer VARCHAR(56),
    fee VARCHAR(100) NOT NULL,
    
    -- Reference
    memo TEXT,
    memo_type VARCHAR(10) CHECK (memo_type IN ('text', 'id', 'hash')),
    
    -- Arbitra-specific references
    agreement_id UUID REFERENCES rent_agreements(id) ON DELETE SET NULL,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    payment_id UUID, -- References rent_payments(id) - can't set FK due to circular dependency
    deposit_id UUID, -- References security_deposits(id) - can't set FK due to circular dependency
    
    -- Additional data
    operations JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Indexing metadata
    indexed BOOLEAN DEFAULT FALSE,
    indexed_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TYPE notification_type AS ENUM (
    'rent_due_reminder',
    'rent_payment_received',
    'rent_payment_late',
    'deposit_received',
    'deposit_released',
    'agreement_signed',
    'agreement_expiring',
    'maintenance_request',
    'dispute_opened',
    'dispute_resolved',
    'message_received',
    'low_balance_warning',
    'transaction_failed'
);

CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push', 'in_app');
CREATE TYPE notification_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification details
    type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    priority notification_priority NOT NULL,
    
    -- Delivery
    channels notification_channel[] NOT NULL,
    sent_via notification_channel[] DEFAULT '{}',
    
    -- Status
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- References
    related_entity_type VARCHAR(20) CHECK (related_entity_type IN ('property', 'agreement', 'payment', 'dispute', 'transaction')),
    related_entity_id UUID,
    
    -- Actions
    action_url TEXT,
    action_label VARCHAR(100),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- WEBHOOKS
-- =====================================================

CREATE TYPE webhook_event AS ENUM (
    'payment.received',
    'payment.failed',
    'deposit.received',
    'deposit.released',
    'agreement.activated',
    'agreement.expired',
    'dispute.created',
    'transaction.indexed'
);

CREATE TABLE webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events webhook_event[] NOT NULL,
    secret TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    event webhook_event NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    successful BOOLEAN NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update updated_at timestamps automatically
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the update trigger to all tables with updated_at
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_modtime ON %I', t.table_name, t.table_name);
        EXECUTE format('CREATE TRIGGER update_%s_modtime
                        BEFORE UPDATE ON %I
                        FOR EACH ROW EXECUTE FUNCTION update_modified_column()',
                      t.table_name, t.table_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
