import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import {
  AuthMethod,
  User,
  UserRole,
} from '../../modules/users/entities/user.entity';
import {
  ListingStatus,
  Property,
  PropertyRentalMode,
  PropertyType,
} from '../../modules/properties/entities/property.entity';
import { PropertyImage } from '../../modules/properties/entities/property-image.entity';
import {
  AgreementStatus,
  RentAgreement,
} from '../../modules/rent/entities/rent-contract.entity';
import { createScriptLogger } from '../../common/services/script-logger';

const logger = createScriptLogger('seed-comprehensive');

// Bcrypt cost 10: fast enough for dev seeds, secure enough for testing
const SALT_ROUNDS = 10;
const SEED_PASSWORD = 'Seed@123456';

// ─── Admin / User fixtures ──────────────────────────────────────────────────

const ADMIN_FIXTURES = [
  {
    email: 'admin.alice@huston-housing.local',
    firstName: 'Alice',
    lastName: 'Okafor',
  },
  {
    email: 'admin.bob@huston-housing.local',
    firstName: 'Bob',
    lastName: 'Mensah',
  },
  {
    email: 'admin.carol@huston-housing.local',
    firstName: 'Carol',
    lastName: 'Nwosu',
  },
  {
    email: 'admin.david@huston-housing.local',
    firstName: 'David',
    lastName: 'Eze',
  },
  {
    email: 'admin.eve@huston-housing.local',
    firstName: 'Eve',
    lastName: 'Adeyemi',
  },
];

const USER_FIXTURES = [
  { email: 'user.frank@huston-housing.local', firstName: 'Frank', lastName: 'Bello' },
  { email: 'user.grace@huston-housing.local', firstName: 'Grace', lastName: 'Dike' },
  { email: 'user.henry@huston-housing.local', firstName: 'Henry', lastName: 'Olawale' },
  { email: 'user.iris@huston-housing.local', firstName: 'Iris', lastName: 'Chukwu' },
  { email: 'user.james@huston-housing.local', firstName: 'James', lastName: 'Abiodun' },
];

// ─── Property fixtures (20 properties with Unsplash images) ─────────────────

interface PropertyFixture {
  title: string;
  description: string;
  type: PropertyType;
  address: string;
  city: string;
  state: string;
  country: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  imageUrls: string[];
}

const PROPERTY_FIXTURES: PropertyFixture[] = [
  {
    title: 'Modern Apartment in Lagos Island',
    description:
      'Spacious 3-bedroom apartment with ocean views and 24/7 security.',
    type: PropertyType.APARTMENT,
    address: '14 Ozumba Mbadiwe Ave',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 350000,
    bedrooms: 3,
    bathrooms: 2,
    area: 120,
    imageUrls: [
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200',
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200',
    ],
  },
  {
    title: 'Executive Duplex in Victoria Island',
    description: 'Luxurious 4-bedroom duplex in a gated estate with pool.',
    type: PropertyType.HOUSE,
    address: '8 Ligali Ayorinde St',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 600000,
    bedrooms: 4,
    bathrooms: 3,
    area: 220,
    imageUrls: [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200',
    ],
  },
  {
    title: 'Studio Flat in Yaba',
    description:
      'Compact studio with high-speed internet, ideal for young professionals.',
    type: PropertyType.APARTMENT,
    address: '22 Herbert Macaulay Way',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 95000,
    bedrooms: 1,
    bathrooms: 1,
    area: 45,
    imageUrls: [
      'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=1200',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200',
    ],
  },
  {
    title: 'Smart Home in Lekki Phase 1',
    description:
      '3-bedroom smart home with automated lighting and climate control.',
    type: PropertyType.HOUSE,
    address: '5 Admiralty Way',
    city: 'Lekki',
    state: 'Lagos',
    country: 'Nigeria',
    price: 480000,
    bedrooms: 3,
    bathrooms: 3,
    area: 180,
    imageUrls: [
      'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200',
      'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1200',
    ],
  },
  {
    title: 'Office Space in Ikoyi',
    description: 'Premium commercial space suitable for a 20-person team.',
    type: PropertyType.COMMERCIAL,
    address: '3 Alfred Rewane Rd',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 900000,
    bedrooms: 0,
    bathrooms: 2,
    area: 300,
    imageUrls: [
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=1200',
    ],
  },
  {
    title: 'Terraced House in Abuja Gwarinpa',
    description: 'Well-maintained 3-bedroom terraced house with garden.',
    type: PropertyType.HOUSE,
    address: '12 1st Avenue',
    city: 'Abuja',
    state: 'FCT',
    country: 'Nigeria',
    price: 280000,
    bedrooms: 3,
    bathrooms: 2,
    area: 145,
    imageUrls: [
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200',
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1200',
    ],
  },
  {
    title: 'Penthouse in Maitama',
    description: 'Top-floor penthouse with panoramic views of Abuja city.',
    type: PropertyType.APARTMENT,
    address: '4 Usuma St',
    city: 'Abuja',
    state: 'FCT',
    country: 'Nigeria',
    price: 750000,
    bedrooms: 4,
    bathrooms: 4,
    area: 260,
    imageUrls: [
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200',
    ],
  },
  {
    title: 'Beachfront Villa in Port Harcourt',
    description: 'Stunning beachfront property with direct beach access.',
    type: PropertyType.HOUSE,
    address: '9 Trans Amadi Industrial Layout',
    city: 'Port Harcourt',
    state: 'Rivers',
    country: 'Nigeria',
    price: 520000,
    bedrooms: 5,
    bathrooms: 4,
    area: 310,
    imageUrls: [
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200',
    ],
  },
  {
    title: 'Budget Apartment in Enugu GRA',
    description:
      'Affordable 2-bedroom flat in a quiet government residential area.',
    type: PropertyType.APARTMENT,
    address: '18 Abakaliki Rd',
    city: 'Enugu',
    state: 'Enugu',
    country: 'Nigeria',
    price: 120000,
    bedrooms: 2,
    bathrooms: 1,
    area: 75,
    imageUrls: [
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200',
    ],
  },
  {
    title: 'Co-working Hub in Ibadan',
    description:
      'Open-plan commercial space with meeting rooms and fast fibre.',
    type: PropertyType.COMMERCIAL,
    address: '7 Ring Road',
    city: 'Ibadan',
    state: 'Oyo',
    country: 'Nigeria',
    price: 200000,
    bedrooms: 0,
    bathrooms: 3,
    area: 180,
    imageUrls: [
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200',
      'https://images.unsplash.com/photo-1527192491265-7e15c55b1ed2?w=1200',
    ],
  },
  {
    title: 'Family Bungalow in Kano',
    description: 'Spacious bungalow with large compound and borehole water.',
    type: PropertyType.HOUSE,
    address: '3 Gwagwarwa Road',
    city: 'Kano',
    state: 'Kano',
    country: 'Nigeria',
    price: 180000,
    bedrooms: 4,
    bathrooms: 2,
    area: 200,
    imageUrls: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200',
      'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=1200',
    ],
  },
  {
    title: 'Luxury Flat in Oniru Estate',
    description: 'High-spec 2-bedroom flat with gym and concierge service.',
    type: PropertyType.APARTMENT,
    address: '1 Oniru Estate',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 420000,
    bedrooms: 2,
    bathrooms: 2,
    area: 110,
    imageUrls: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200',
      'https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?w=1200',
    ],
  },
  {
    title: 'Industrial Warehouse in Apapa',
    description:
      'Large warehouse suitable for logistics and storage operations.',
    type: PropertyType.COMMERCIAL,
    address: '15 Creek Road',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 1200000,
    bedrooms: 0,
    bathrooms: 2,
    area: 800,
    imageUrls: [
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200',
      'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=1200',
    ],
  },
  {
    title: 'Serviced Apartment in Banana Island',
    description:
      'Fully-serviced 3-bedroom apartment with hotel-grade amenities.',
    type: PropertyType.APARTMENT,
    address: '2 Bourdillon Court',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 850000,
    bedrooms: 3,
    bathrooms: 3,
    area: 160,
    imageUrls: [
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=1200',
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200',
    ],
  },
  {
    title: 'Starter Flat in Surulere',
    description:
      'Neat 1-bedroom flat close to National Stadium, great transport links.',
    type: PropertyType.APARTMENT,
    address: '6 Bode Thomas St',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 85000,
    bedrooms: 1,
    bathrooms: 1,
    area: 55,
    imageUrls: [
      'https://images.unsplash.com/photo-1555636222-cae831e670b3?w=1200',
      'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200',
    ],
  },
  {
    title: 'Garden Cottage in Asokoro',
    description:
      'Charming 2-bedroom cottage with mature garden in a quiet neighbourhood.',
    type: PropertyType.HOUSE,
    address: '11 Tafawa Balewa Way',
    city: 'Abuja',
    state: 'FCT',
    country: 'Nigeria',
    price: 320000,
    bedrooms: 2,
    bathrooms: 2,
    area: 130,
    imageUrls: [
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1200',
      'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=1200',
    ],
  },
  {
    title: 'Town House in Ikeja GRA',
    description: 'Executive 4-bedroom townhouse in the heart of Ikeja GRA.',
    type: PropertyType.HOUSE,
    address: '27 Mobolaji Bank Anthony Way',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 550000,
    bedrooms: 4,
    bathrooms: 3,
    area: 240,
    imageUrls: [
      'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=1200',
      'https://images.unsplash.com/photo-1575517111839-3a3843ee7f5d?w=1200',
    ],
  },
  {
    title: 'Studio in Maryland Mall',
    description: 'Modern studio apartment minutes from Maryland Mall.',
    type: PropertyType.APARTMENT,
    address: '33 Ikorodu Road',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    price: 110000,
    bedrooms: 1,
    bathrooms: 1,
    area: 48,
    imageUrls: [
      'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=1200',
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200',
    ],
  },
  {
    title: 'Detached House in Owerri',
    description: 'Well-appointed 5-bedroom detached house with boys quarters.',
    type: PropertyType.HOUSE,
    address: '4 Port Harcourt Road',
    city: 'Owerri',
    state: 'Imo',
    country: 'Nigeria',
    price: 270000,
    bedrooms: 5,
    bathrooms: 3,
    area: 280,
    imageUrls: [
      'https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=1200',
      'https://images.unsplash.com/photo-1499955085172-a104c9463ece?w=1200',
    ],
  },
  {
    title: 'Riverside Apartment in Calabar',
    description: 'Elegant 2-bedroom apartment with views of the Cross River.',
    type: PropertyType.APARTMENT,
    address: '10 Ndidem Usang Iso Road',
    city: 'Calabar',
    state: 'Cross River',
    country: 'Nigeria',
    price: 155000,
    bedrooms: 2,
    bathrooms: 2,
    area: 90,
    imageUrls: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200',
      'https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1200',
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function upsertUser(
  repo: ReturnType<DataSource['getRepository']>,
  fixture: { email: string; firstName: string; lastName: string },
  role: UserRole,
  passwordHash: string,
): Promise<User> {
  const existing = await repo.findOne({
    where: { email: fixture.email },
  });
  if (existing) {
    return existing as User;
  }
  const user = repo.create({
    email: fixture.email,
    firstName: fixture.firstName,
    lastName: fixture.lastName,
    password: passwordHash,
    role,
    emailVerified: true,
    isActive: true,
    authMethod: AuthMethod.PASSWORD,
    failedLoginAttempts: 0,
    verificationToken: null,
    resetToken: null,
    resetTokenExpires: null,
    accountLockedUntil: null,
    refreshToken: null,
  });
  return repo.save(user) as Promise<User>;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedComprehensiveData(
  dataSource: DataSource,
): Promise<void> {
  const userRepo = dataSource.getRepository(User);
  const propertyRepo = dataSource.getRepository(Property);
  const imageRepo = dataSource.getRepository(PropertyImage);
  const agreementRepo = dataSource.getRepository(RentAgreement);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  // 1. Seed 5 admin users
  logger.log('Seeding admin users...');
  const admins: User[] = [];
  for (const fixture of ADMIN_FIXTURES) {
    const admin = await upsertUser(
      userRepo,
      fixture,
      UserRole.ADMIN,
      passwordHash,
    );
    admins.push(admin);
  }
  logger.log(`Admin users ready: ${admins.length}`);

  // 2. Seed 5 regular users (tenants)
  logger.log('Seeding regular users...');
  const users: User[] = [];
  for (const fixture of USER_FIXTURES) {
    const user = await upsertUser(
      userRepo,
      fixture,
      UserRole.USER,
      passwordHash,
    );
    users.push(user);
  }
  logger.log(`Regular users ready: ${users.length}`);

  // 3. Seed 20 properties
  logger.log('Seeding properties...');
  const properties: Property[] = [];
  for (let i = 0; i < PROPERTY_FIXTURES.length; i++) {
    const fixture = PROPERTY_FIXTURES[i];
    const owner = admins[i % admins.length];

    const existing = await propertyRepo.findOne({
      where: { title: fixture.title },
    });
    if (existing) {
      properties.push(existing);
      continue;
    }

    const property = propertyRepo.create({
      title: fixture.title,
      description: fixture.description,
      type: fixture.type,
      status: ListingStatus.PUBLISHED,
      address: fixture.address,
      city: fixture.city,
      state: fixture.state,
      postalCode: '100001',
      country: fixture.country,
      price: fixture.price,
      currency: 'USD',
      bedrooms: fixture.bedrooms,
      bathrooms: fixture.bathrooms,
      area: fixture.area,
      ownerId: owner.id,
      rentalMode: PropertyRentalMode.LONG_TERM,
    });

    const savedProperty = await propertyRepo.save(property);

    for (let j = 0; j < fixture.imageUrls.length; j++) {
      const image = imageRepo.create({
        url: fixture.imageUrls[j],
        sortOrder: j,
        isPrimary: j === 0,
        propertyId: savedProperty.id,
      });
      await imageRepo.save(image);
    }

    properties.push(savedProperty);
  }
  logger.log(`Properties ready: ${properties.length}`);

  // 4. Seed agreements (5 ACTIVE, 5 DRAFT, 5 EXPIRED)
  logger.log('Seeding agreements...');
  const agreementScenarios: Array<{
    status: AgreementStatus;
    startOffset: number;
    endOffset: number;
  }> = [
    // ACTIVE: started 6 months ago, ends in 6 months
    ...Array.from({ length: 5 }, () => ({
      status: AgreementStatus.ACTIVE,
      startOffset: -180,
      endOffset: 180,
    })),
    // DRAFT: no dates
    ...Array.from({ length: 5 }, () => ({
      status: AgreementStatus.DRAFT,
      startOffset: 0,
      endOffset: 0,
    })),
    // EXPIRED: started 13 months ago, ended 1 month ago
    ...Array.from({ length: 5 }, () => ({
      status: AgreementStatus.EXPIRED,
      startOffset: -395,
      endOffset: -30,
    })),
  ];

  let agreementsCreated = 0;
  for (let i = 0; i < agreementScenarios.length; i++) {
    const scenario = agreementScenarios[i];
    const admin = admins[i % admins.length];
    const user = users[i % users.length];
    const property = properties[i % properties.length];
    const agreementNumber = `AGR-SEED-${String(i + 1).padStart(4, '0')}`;

    const existing = await agreementRepo.findOne({
      where: { agreementNumber },
    });
    if (existing) {
      continue;
    }

    const now = new Date();
    const msPerDay = 86_400_000;
    const startDate =
      scenario.status !== AgreementStatus.DRAFT
        ? new Date(now.getTime() + scenario.startOffset * msPerDay)
        : null;
    const endDate =
      scenario.status !== AgreementStatus.DRAFT
        ? new Date(now.getTime() + scenario.endOffset * msPerDay)
        : null;

    const agreement = agreementRepo.create({
      agreementNumber,
      propertyId: property.id,
      adminId: admin.id,
      userId: user.id,
      status: scenario.status,
      monthlyRent: 150000 + (i % 5) * 25000,
      securityDeposit: 300000 + (i % 5) * 50000,
      startDate,
      endDate,
      renewalOption: scenario.status === AgreementStatus.ACTIVE,
    });

    await agreementRepo.save(agreement);
    agreementsCreated++;
  }
  logger.log(
    `Agreements ready: ${agreementsCreated} created (skipped existing)`,
  );

  logger.log(
    `Comprehensive seed complete. Default password for all seed accounts: ${SEED_PASSWORD}`,
  );
}
