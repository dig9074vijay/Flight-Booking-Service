# Flight Booking Service - Low Level Design (LLD) Documentation

## 1. Project Overview

### Problem Statement
The Flight Booking Service is a microservice designed to handle flight booking operations in a distributed airline reservation system. It addresses the challenge of managing concurrent booking requests while ensuring seat availability consistency, payment reliability, and automatic cleanup of expired unpaid bookings.

### High-Level Architecture Summary
This is a **RESTful API service** built using **Node.js** and **Express.js**, following a **layered architecture** pattern. The service integrates with an external Flight Service to verify seat availability and update inventory in real-time. It implements transactional consistency, idempotent payment processing, and automated booking lifecycle management through scheduled jobs.

### Core Modules
- **Booking Management**: Handles creation and lifecycle of flight bookings
- **Payment Processing**: Processes payments with idempotency guarantees
- **Inventory Synchronization**: Coordinates with Flight Service for seat availability
- **Automated Cleanup**: Cancels expired unpaid bookings via cron jobs
- **Audit & Logging**: Structured logging for debugging and monitoring

---

## 2. Functional Requirements

### Core Functionalities
1. **Create Booking**
   - Accept booking requests with flightId, userId, and number of seats
   - Validate seat availability from external Flight Service
   - Calculate total cost based on seat price and quantity
   - Reserve seats by updating Flight Service inventory
   - Create booking record with "initiated" status
   - Ensure atomicity through database transactions

2. **Process Payment**
   - Accept payment for existing bookings within 15-minute window
   - Validate payment amount matches booking cost
   - Verify user ownership of booking
   - Support idempotent payment requests via idempotency keys
   - Update booking status to "booked" on successful payment

3. **Cancel Booking**
   - Cancel individual bookings manually or automatically
   - Restore seats to Flight Service inventory
   - Update booking status to "cancelled"
   - Ensure consistency through transactions

4. **Automatic Expiry**
   - Run scheduled jobs every 10 seconds
   - Cancel bookings older than payment window (currently 1 minute for testing, 15 minutes for production)
   - Process batch cancellations efficiently

### Assumptions
- External Flight Service is available and responds within acceptable timeframes
- Payment window is configurable (implemented as 1 minute in cron job for testing, 15 minutes in payment logic)
- One user can have multiple active bookings
- Seat prices are determined by Flight Service and remain constant during booking lifecycle
- Idempotency keys are unique per payment request

---

## 3. Non-Functional Requirements

### Scalability
- **Horizontal Scaling**: Stateless service design allows multiple instances
- **Limitation**: In-memory idempotency cache prevents true horizontal scaling
- **Solution Path**: Replace with distributed cache (Redis/Memcached)
- **Database Connection Pooling**: Sequelize handles connection pooling for MySQL

### Performance
- **Transaction Management**: Minimizes locking duration
- **Bulk Operations**: Cron job uses single query for batch cancellations
- **HTTP Client**: Axios for efficient external service communication
- **Response Time Target**: Sub-second for booking creation and payment processing

### Maintainability
- **Layered Architecture**: Clear separation of concerns (Controller → Service → Repository)
- **Centralized Error Handling**: Custom AppError class with status codes
- **Configuration Management**: Environment-based configuration via dotenv
- **Logging**: Winston logger for structured logging

### Testability
- **Dependency Injection**: Services and repositories can be mocked
- **Transaction Support**: Database operations can be tested in isolation
- **API Specification**: OpenAPI 3.0 spec available (api-spec.yaml)
- **Current Gap**: No unit or integration tests implemented yet

### Extensibility
- **Repository Pattern**: Easy to add new data access methods
- **Service Layer**: Business logic isolated from HTTP concerns
- **Enum-Driven Status**: Easy to add new booking statuses
- **API Versioning**: Routes organized under /v1 for future versions

---

## 4. System Architecture

### Architectural Style
The system follows **Layered Architecture** with **Repository Pattern**, implementing a clear separation between:
1. **Presentation Layer** (Controllers)
2. **Business Logic Layer** (Services)
3. **Data Access Layer** (Repositories)
4. **Database Layer** (MySQL via Sequelize ORM)

This is also known as **N-Tier Architecture** or **Service-Repository Pattern**.

### Module Breakdown

```
┌─────────────────────────────────────────────────────────┐
│                    Express.js Server                     │
│                  (Entry Point: src/index.js)             │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │      API Routes         │
        │  (routes/v1/*.js)       │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │     Controllers         │
        │  (Request/Response)     │
        │  - BookingController    │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │      Services           │
        │  (Business Logic)       │
        │  - BookingService       │
        │  - External API Calls   │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │    Repositories         │
        │  (Data Access)          │
        │  - BookingRepository    │
        │  - CrudRepository       │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │    Sequelize ORM        │
        │    (Models/Booking)     │
        └────────────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │      MySQL Database     │
        │    (Bookings Table)     │
        └─────────────────────────┘

External Dependencies:
┌─────────────────────────────────┐
│    Flight Service (HTTP API)    │
│  - GET /flights/:id             │
│  - PATCH /flights/:id/seats     │
└─────────────────────────────────┘

Background Jobs:
┌─────────────────────────────────┐
│    Cron Scheduler               │
│  - Runs every 10 seconds        │
│  - Cancels expired bookings     │
└─────────────────────────────────┘
```

### Responsibility Segregation

| Layer | Responsibility | File Location |
|-------|---------------|---------------|
| **Routes** | Map HTTP endpoints to controller methods | `src/routes/v1/` |
| **Controllers** | Parse requests, invoke services, format responses | `src/controllers/` |
| **Services** | Implement business logic, coordinate operations | `src/services/` |
| **Repositories** | Execute database queries, data persistence | `src/repositories/` |
| **Models** | Define database schema and relationships | `src/models/` |
| **Utils** | Shared utilities, error classes, enums | `src/utils/` |
| **Config** | Environment variables, logger, database config | `src/config/` |

---

## 5. Core Entities & Domain Models

### Booking Entity
The central domain model representing a flight reservation.

**Attributes:**
- `id` (INTEGER, Primary Key, Auto-increment): Unique booking identifier
- `flightId` (INTEGER, NOT NULL): Reference to flight in external service
- `userId` (INTEGER, NOT NULL): Reference to user making the booking
- `status` (ENUM, NOT NULL): Current state of booking
  - Values: `initiated`, `booked`, `cancelled`, `pending`
  - Default: `initiated`
- `noOfSeats` (INTEGER, NOT NULL, Default: 1): Number of seats booked
- `totalCost` (INTEGER, NOT NULL): Total cost in currency units
- `createdAt` (TIMESTAMP): Booking creation time (for expiry calculation)
- `updatedAt` (TIMESTAMP): Last modification time

**Relationships:**
- **External Relationship**: `flightId` references Flight entity in Flight Service (not enforced via FK)
- **External Relationship**: `userId` references User entity (assumed to exist in User Service)
- **Aggregate Root**: Booking is an aggregate root with no child entities

**State Machine:**
```
    [initiated] ──payment success──> [booked]
         │
         ├──timeout (15 min)──> [cancelled]
         │
         └──manual cancel──> [cancelled]
```

**Domain Invariants:**
1. Payment must occur within 15 minutes of creation
2. Total cost = number of seats × seat price (calculated at creation)
3. Once booked or cancelled, status cannot change
4. Seats must be available at the time of booking

---

## 6. Class Design

### 6.1 Controller Layer

#### **BookingController** (`src/controllers/booking-controller.js`)

**Responsibilities:**
- Handle HTTP requests and responses
- Extract and validate request data
- Invoke appropriate service methods
- Format success/error responses
- Manage idempotency cache

**Key Methods:**
- `createBooking(req, res)`: Creates new booking
- `makePayment(req, res)`: Processes payment with idempotency

**Dependencies:**
- `BookingService`: Business logic execution
- `successResponse`, `errorResponse`: Response formatters
- `inMemoryCache`: Idempotency key storage

**Interaction:**
```
HTTP Request → Controller.createBooking()
                      ↓
            BookingService.createBooking()
                      ↓
            Format Response & Send
```

### 6.2 Service Layer

#### **BookingService** (`src/services/booking-service.js`)

**Responsibilities:**
- Orchestrate business operations
- Coordinate with external Flight Service
- Manage database transactions
- Implement business validation rules
- Calculate derived values (total cost)

**Key Methods:**

1. **`createBooking(data)`**
   - Validates seat availability via Flight Service API
   - Calculates total cost
   - Creates booking record
   - Updates seat inventory
   - Uses database transaction for atomicity

2. **`makePayment(data)`**
   - Validates payment timing (15-minute window)
   - Verifies payment amount and user ownership
   - Updates booking status to "booked"
   - Handles expired bookings

3. **`cancelBooking(bookingId)`**
   - Restores seats to Flight Service
   - Updates booking status to "cancelled"
   - Idempotent operation (checks existing status)

4. **`cancelOldBookings()`**
   - Bulk cancels expired bookings
   - Called by cron scheduler
   - No seat restoration (optimization for expired bookings)

**Dependencies:**
- `BookingRepository`: Data persistence
- `axios`: HTTP client for Flight Service
- `db.sequelize`: Transaction management
- `AppError`: Custom error handling

### 6.3 Repository Layer

#### **CrudRepository** (`src/repositories/crud-repository.js`)

**Responsibilities:**
- Base class providing generic CRUD operations
- Abstract database interaction logic
- Handle database errors

**Key Methods:**
- `create(data)`: Insert new record
- `get(id)`: Fetch by primary key
- `getAll()`: Fetch all records
- `update(data, id)`: Update record
- `destroy(id)`: Delete record

**Design Pattern:** **Base Class Pattern** (Template Method influence)

#### **BookingRepository** (`src/repositories/booking-repository.js`)

**Responsibilities:**
- Extend CrudRepository with booking-specific operations
- Support transaction-aware operations
- Implement complex queries (bulk updates)

**Key Methods:**
- `createBooking(data, transaction)`: Create with transaction
- `get(id, transaction)`: Fetch with transaction
- `update(data, id, transaction)`: Update with transaction
- `cancelOldBookings(timestamp)`: Bulk cancel using Sequelize operators

**Inheritance:**
```
CrudRepository (Base)
       ↑
       │ extends
       │
BookingRepository (Derived)
```

**Query Example:**
```javascript
// Cancel bookings older than timestamp, not already booked or cancelled
cancelOldBookings(timestamp) {
  UPDATE Bookings 
  SET status = 'cancelled'
  WHERE createdAt < timestamp
    AND status != 'booked'
    AND status != 'cancelled'
}
```

### 6.4 Dependency Direction

```
Controllers ──depends on──> Services
                                │
                                ↓
                         Repositories
                                │
                                ↓
                            Models
```

**Key Principle:** Dependencies point inward (toward domain logic), never outward. Controllers know about Services, but Services don't know about Controllers.

---

## 7. Design Patterns Used

### 7.1 **Repository Pattern**

**Where:** `CrudRepository`, `BookingRepository`

**Why Chosen:**
- Abstracts data access logic from business logic
- Provides a collection-like interface for domain objects
- Enables easy testing through mock repositories
- Centralizes query logic

**Problem It Solves:**
- Prevents service layer from knowing database implementation details
- Makes it easy to switch databases or ORMs
- Reduces code duplication for common CRUD operations

**Implementation:**
```javascript
class BookingRepository extends CrudRepository {
  createBooking(data, transaction) {
    return Booking.create(data, { transaction });
  }
}
```

### 7.2 **Layered Architecture Pattern**

**Where:** Entire application structure

**Why Chosen:**
- Clear separation of concerns
- Each layer has single responsibility
- Easy to maintain and test
- Industry-standard for web services

**Problem It Solves:**
- Prevents mixing HTTP concerns with business logic
- Enables independent evolution of layers
- Improves code organization and readability

**Layers:**
1. Presentation (Controllers)
2. Business Logic (Services)
3. Data Access (Repositories)
4. Database (Models)

### 7.3 **Template Method Pattern** (Implicit)

**Where:** `CrudRepository` base class

**Why Chosen:**
- Provides common CRUD operations to all repositories
- Allows derived classes to override specific behavior
- Reduces code duplication

**Problem It Solves:**
- Avoids rewriting basic CRUD operations for each entity
- Maintains consistent data access patterns

**Implementation:**
```javascript
class CrudRepository {
  async create(data) { /* generic implementation */ }
  async get(id) { /* generic implementation */ }
}

class BookingRepository extends CrudRepository {
  // Override with transaction support
  async get(id, transaction) { /* custom implementation */ }
}
```

### 7.4 **Dependency Injection** (Constructor Injection)

**Where:** `CrudRepository` constructor

**Why Chosen:**
- Loosely couples repositories from specific models
- Enables testing with mock models
- Follows Dependency Inversion Principle

**Problem It Solves:**
- Makes CrudRepository reusable for any Sequelize model
- Improves testability

**Implementation:**
```javascript
class CrudRepository {
  constructor(model) {
    this.model = model; // Injected dependency
  }
}

class BookingRepository extends CrudRepository {
  constructor() {
    super(Booking); // Inject Booking model
  }
}
```

### 7.5 **Idempotency Pattern**

**Where:** `BookingController.makePayment()`

**Why Chosen:**
- Prevents duplicate payment processing
- Ensures safe retries for payment requests
- Critical for financial transactions

**Problem It Solves:**
- Network failures or client retries could cause double charges
- Distributed systems need idempotent operations

**Implementation:**
```javascript
const idempotencyKey = req.headers["x-idempotency-key"];
if (inMemoryCache["x-idempotency-key"] === idempotencyKey) {
  return cached_response; // Prevent duplicate processing
}
```

**Limitation:** In-memory cache doesn't survive restarts or work across multiple instances. Production should use Redis.

### 7.6 **Unit of Work Pattern** (via Transactions)

**Where:** All service methods

**Why Chosen:**
- Ensures atomicity of multi-step operations
- Maintains data consistency
- Enables rollback on failures

**Problem It Solves:**
- Prevents partial updates (booking created but seats not decremented)
- Ensures all-or-nothing execution

**Implementation:**
```javascript
const transaction = await db.sequelize.transaction();
try {
  await bookingRepository.createBooking(data, transaction);
  await axios.patch(flightServiceUrl, updateSeats);
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
}
```

### 7.7 **Facade Pattern** (Implicit)

**Where:** `BookingService` acts as facade to external Flight Service

**Why Chosen:**
- Simplifies interaction with external API
- Centralizes external service communication
- Hides complexity of HTTP calls

**Problem It Solves:**
- Controllers don't need to know about Flight Service endpoints
- Easy to change external service implementation

### 7.8 **Scheduled Job Pattern** (Cron)

**Where:** `src/utils/common/cron-jobs.js`

**Why Chosen:**
- Automates booking expiry without manual intervention
- Runs at regular intervals
- Decouples cleanup logic from user requests

**Problem It Solves:**
- Bookings need automatic expiry after 15 minutes
- Manual cleanup is not scalable

**Implementation:**
```javascript
cron.schedule("*/10 * * * * *", async () => {
  await BookingService.cancelOldBookings();
});
```

### 7.9 **Custom Error Handling Pattern**

**Where:** `AppError` class in `utils/errors/`

**Why Chosen:**
- Standardizes error responses
- Includes HTTP status codes
- Provides consistent error structure

**Problem It Solves:**
- Prevents generic JavaScript errors from leaking to clients
- Enables proper HTTP status code mapping

**Implementation:**
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

throw new AppError("Not enough seats", StatusCodes.BAD_REQUEST);
```

---

## 8. SOLID Principles Implementation

### 8.1 Single Responsibility Principle (SRP)

**How Followed:**
- **Controllers**: Only handle HTTP request/response formatting
- **Services**: Only contain business logic
- **Repositories**: Only manage data persistence
- **Models**: Only define database schema

**Example:**
```javascript
// Controller: Only HTTP concerns
async function createBooking(req, res) {
  const booking = await BookingService.createBooking(req.body);
  res.status(StatusCodes.CREATED).json(successResponse);
}

// Service: Only business logic
async function createBooking(data) {
  const flight = await axios.get(flightServiceUrl);
  if (data.noOfSeats > flight.totalSeats) throw error;
  // ... business logic
}
```

### 8.2 Open/Closed Principle (OCP)

**How Maintained:**
- **CrudRepository** is open for extension (inheritance) but closed for modification
- New repositories can extend CrudRepository without changing it
- New booking statuses can be added to Enum without modifying existing code

**Example:**
```javascript
// CrudRepository is closed for modification
class CrudRepository {
  async create(data) { /* ... */ }
}

// But open for extension
class BookingRepository extends CrudRepository {
  cancelOldBookings(timestamp) { /* new behavior */ }
}
```

**Extensibility Point:**
- Adding `RefundRepository`, `NotificationRepository` doesn't require changing CrudRepository

### 8.3 Liskov Substitution Principle (LSP)

**How Ensured:**
- `BookingRepository` can substitute `CrudRepository` anywhere
- Derived class overrides don't violate base class contracts
- Method signatures remain compatible

**Example:**
```javascript
// Base class contract
class CrudRepository {
  async get(id) { return record; }
}

// Derived class maintains contract (adds optional parameter)
class BookingRepository extends CrudRepository {
  async get(id, transaction = null) { return record; }
}

// Can substitute anywhere
const repo: CrudRepository = new BookingRepository();
repo.get(123); // Works correctly
```

### 8.4 Interface Segregation Principle (ISP)

**How Applied:**
- Repositories expose only methods needed by services
- Controllers only expose HTTP-specific methods
- Services don't expose internal helper methods

**Example:**
```javascript
// BookingRepository only exposes needed methods
class BookingRepository {
  createBooking(data, transaction) { }
  cancelOldBookings(timestamp) { }
  // Does NOT expose unrelated methods like getFlightDetails()
}
```

**Benefit:** Services using BookingRepository don't depend on methods they don't use.

### 8.5 Dependency Inversion Principle (DIP)

**How Implemented:**
- **High-level modules (Services) don't depend on low-level modules (Repositories)**
- Both depend on abstractions (CrudRepository base class)
- Controllers depend on Service interface, not implementation details

**Example:**
```javascript
// High-level Service depends on abstraction (Repository interface)
class BookingService {
  constructor() {
    this.bookingRepository = new BookingRepository(); // Could be injected
  }
}

// Repository implements abstraction
class BookingRepository extends CrudRepository {
  // Implements repository contract
}
```

**Improvement Opportunity:** Could use explicit interfaces (via TypeScript) or constructor injection for better DIP adherence.

---

## 9. Data Flow Explanation

### 9.1 Create Booking Flow

**Step-by-Step Request Lifecycle:**

```
1. HTTP POST /api/v1/bookings
   Body: { flightId: 101, userId: 1001, noOfSeats: 2 }
   
2. Express Router (routes/v1/booking.js)
   Matches route → Invokes BookingController.createBooking()

3. BookingController.createBooking()
   - Extracts data from req.body
   - Calls BookingService.createBooking(data)

4. BookingService.createBooking()
   - Starts database transaction
   - Makes HTTP GET to Flight Service: /api/v1/flights/101
   - Receives flight details: { totalSeats: 50, price: 5000, ... }
   
5. Business Validation
   - Checks: noOfSeats (2) <= totalSeats (50) ✓
   - Calculates: totalCost = 2 × 5000 = 10000

6. BookingRepository.createBooking()
   - Executes: INSERT INTO Bookings (flightId, userId, noOfSeats, totalCost, status)
              VALUES (101, 1001, 2, 10000, 'initiated')
   - Returns booking object with id: 12345

7. Flight Service Update
   - Makes HTTP PATCH to /api/v1/flights/101/seats
   - Body: { seats: 2, dec: 1 }
   - Flight Service decrements available seats by 2

8. Transaction Commit
   - Database transaction committed
   - Changes persisted

9. Response to Client
   - Controller formats success response
   - HTTP 201 Created
   - Body: { success: true, data: { id: 12345, status: 'initiated', ... } }
```

**Error Scenario:**
```
If Flight Service returns error or seats unavailable:
→ Transaction rollback
→ Booking not created
→ HTTP 400/500 error response
```

### 9.2 Make Payment Flow

**Step-by-Step Request Lifecycle:**

```
1. HTTP POST /api/v1/bookings/payments
   Headers: { "x-idempotency-key": "abc123" }
   Body: { bookingId: 12345, userId: 1001, totalCost: 10000 }

2. Express Router → BookingController.makePayment()

3. Idempotency Check
   - Extract idempotency key from headers
   - Check inMemoryCache["x-idempotency-key"] === "abc123"
   - If found → Return cached response (prevent duplicate payment)
   - If not found → Proceed

4. BookingService.makePayment()
   - Start transaction
   - Fetch booking: SELECT * FROM Bookings WHERE id = 12345

5. Time Validation
   - createdAt: 2024-01-01 10:00:00
   - currentTime: 2024-01-01 10:05:00
   - diffInMinutes: 5 minutes ✓ (< 15 minutes)

6. Business Validations
   - Check status != 'cancelled' ✓
   - Check totalCost matches (10000 == 10000) ✓
   - Check userId matches (1001 == 1001) ✓

7. Update Booking Status
   - Execute: UPDATE Bookings SET status = 'booked' WHERE id = 12345
   - Commit transaction

8. Cache Idempotency Key
   - inMemoryCache["x-idempotency-key"] = "abc123"

9. Response to Client
   - HTTP 201 Created
   - Body: { success: true, message: "Payment made successfully" }
```

**Expired Booking Scenario:**
```
If diffInMinutes > 15:
→ Call cancelBooking(12345)
→ Restore seats to Flight Service
→ Return HTTP 400: "Booking payment time expired"
```

### 9.3 Automatic Cancellation Flow (Cron Job)

**Step-by-Step Execution:**

```
1. Cron Scheduler (Every 10 seconds)
   - Trigger: cron.schedule("*/10 * * * * *")
   - Invokes: BookingService.cancelOldBookings()

2. Calculate Expiry Timestamp
   - currentTime: 2024-01-01 10:10:00
   - expiryThreshold: currentTime - 1 minute = 2024-01-01 10:09:00
   - (Note: 1 minute for testing, would be 15 minutes in production)

3. BookingRepository.cancelOldBookings(expiryThreshold)
   - Execute bulk update query:
     UPDATE Bookings 
     SET status = 'cancelled'
     WHERE createdAt < '2024-01-01 10:09:00'
       AND status != 'booked'
       AND status != 'cancelled'

4. Database Returns
   - affectedRows: 5 (5 expired bookings cancelled)

5. Log Result
   - Console: "Cancelled bookings: 5"

6. No Seat Restoration
   - Optimization: Seats not restored for expired bookings
   - Assumption: Flight Service has its own reconciliation logic
```

**Design Decision:** Cron job does NOT restore seats to Flight Service for performance. This could be a tradeoff depending on business requirements.

---

## 10. Error Handling Strategy

### 10.1 Error Handling Approach

**1. Custom Error Class (AppError)**
```javascript
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode; // HTTP status code
    this.explanation = message;   // Error details
  }
}
```

**2. Error Propagation**
- Errors thrown in Repository → Caught in Service → Caught in Controller
- Each layer can add context before re-throwing

**3. Error Response Format**
```javascript
{
  success: false,
  message: "Failed to create booking",
  error: {
    statusCode: 400,
    explanation: "Not enough seats available"
  }
}
```

### 10.2 Error Scenarios

| Scenario | Status Code | Handling |
|----------|-------------|----------|
| Seat availability insufficient | 400 (Bad Request) | Service throws AppError, transaction rolled back |
| Booking not found | 404 (Not Found) | Repository throws AppError |
| Payment timeout (> 15 min) | 400 (Bad Request) | Service auto-cancels booking |
| Payment amount mismatch | 400 (Bad Request) | Service throws AppError |
| User ID mismatch | 400 (Bad Request) | Service throws AppError |
| Database error | 500 (Internal Server Error) | Service catches, logs, throws generic error |
| Flight Service unavailable | 500 (Internal Server Error) | Service catches axios error, rolls back transaction |
| Missing idempotency key | 400 (Bad Request) | Controller throws AppError |

### 10.3 Transaction Rollback Strategy

**Pattern:**
```javascript
const transaction = await db.sequelize.transaction();
try {
  // Multiple operations
  await operation1(transaction);
  await operation2(transaction);
  await transaction.commit();
} catch (error) {
  await transaction.rollback(); // Undo all changes
  throw error; // Propagate to controller
}
```

**Ensures:**
- Atomicity: All operations succeed or none do
- Consistency: Database never in partial state
- No orphaned bookings without seat updates

### 10.4 Validation Approach

**Input Validation:**
- Currently handled in service layer
- Business rules validated before database operations
- Example: Check seat availability before creating booking

**Improvement Opportunity:**
- Add validation middleware at controller level
- Use libraries like `Joi` or `express-validator`
- Validate request schema before calling service

**Example Future Validation:**
```javascript
// Middleware (not currently implemented)
validateBooking: [
  body('flightId').isInt().notEmpty(),
  body('userId').isInt().notEmpty(),
  body('noOfSeats').isInt({ min: 1, max: 10 })
]
```

### 10.5 Retry Strategy

**Current Implementation:** No automatic retries

**External Service Failures:**
- Flight Service calls do NOT retry automatically
- Entire transaction fails and rolls back
- Client responsible for retrying request

**Improvement Opportunity:**
- Implement exponential backoff for Flight Service calls
- Use axios-retry library
- Retry transient network failures (timeouts, 503)
- Do NOT retry business errors (400, 404)

**Example Future Retry:**
```javascript
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return error.response.status >= 500; // Only retry server errors
  }
});
```

---

## 11. Concurrency / Threading Model

### 11.1 Node.js Event Loop

**Runtime:** Node.js (single-threaded event loop)

**How It Works:**
- Single thread handles all requests concurrently
- Non-blocking I/O operations (database, HTTP calls)
- Callbacks/Promises handle asynchronous results

**Implications:**
- Service can handle thousands of concurrent requests
- CPU-intensive operations would block event loop (not present in this service)
- All I/O operations are async (axios, Sequelize)

### 11.2 Database Connection Pool

**Managed By:** Sequelize ORM

**Configuration:** (Sequelize defaults)
- Minimum connections: 0
- Maximum connections: 5 (can be configured)
- Idle timeout: 10 seconds

**Concurrency Handling:**
- Multiple requests share connection pool
- Sequelize queues queries if pool exhausted
- Transactions hold connections until commit/rollback

### 11.3 Transaction Isolation

**Level:** READ COMMITTED (MySQL default)

**Concurrency Scenarios:**

**1. Concurrent Booking Requests for Same Flight**
```
Request A: Books 2 seats for Flight 101
Request B: Books 3 seats for Flight 101 (starts simultaneously)

Timeline:
T1: A starts transaction, reads Flight 101 (50 seats)
T2: B starts transaction, reads Flight 101 (50 seats)
T3: A updates Flight Service (50 → 48 seats)
T4: B updates Flight Service (48 → 45 seats)
T5: A commits
T6: B commits

Result: Both bookings succeed, 5 seats decremented ✓
```

**Potential Race Condition:**
If Flight Service doesn't handle concurrent updates atomically, seat count could be inconsistent.

**Mitigation:** Assumes Flight Service uses pessimistic locking or optimistic concurrency control.

**2. Concurrent Payment for Same Booking**

**Protected By:** Idempotency keys

```
Request A: Payment for Booking 12345 (idempotency: key1)
Request B: Payment for Booking 12345 (idempotency: key1)

Timeline:
T1: A checks cache (miss), proceeds
T2: B checks cache (miss), proceeds
T3: A updates booking to 'booked'
T4: A stores key1 in cache
T5: B attempts update (booking already 'booked')

Result: First request succeeds, second fails or is idempotent ✓
```

**Database-Level Protection:** Update query could use optimistic locking (version column) for stronger guarantees.

### 11.4 Cron Job Concurrency

**Scheduler:** node-cron

**Execution Model:**
- Runs on same event loop as HTTP requests
- Non-blocking: `async/await` used
- No parallel execution (single Node.js instance)

**Potential Issue:**
- If cron job takes longer than 10 seconds, next execution could overlap
- Solution: Use job locking or skip execution if previous job still running

**Example Improvement:**
```javascript
let isJobRunning = false;
cron.schedule("*/10 * * * * *", async () => {
  if (isJobRunning) return; // Skip if already running
  isJobRunning = true;
  try {
    await BookingService.cancelOldBookings();
  } finally {
    isJobRunning = false;
  }
});
```

### 11.5 No Worker Threads

**Current Implementation:** All operations on main thread

**Why Acceptable:**
- All operations are I/O-bound (database, HTTP)
- No CPU-intensive computations (image processing, encryption)
- Node.js event loop efficiently handles I/O concurrency

**When Worker Threads Needed:**
- Generating reports (large data processing)
- Complex calculations (pricing algorithms)
- Not applicable to current service

---

## 12. Extensibility Points

### 12.1 Adding New Booking Statuses

**Extension Point:** `src/utils/common/enums.js`

**How to Extend:**
```javascript
// Add new status to enum
BOOKING_STATUS: {
  INITIATED: "initiated",
  BOOKED: "booked",
  CANCELLED: "cancelled",
  PENDING: "pending",
  REFUNDED: "refunded",        // NEW
  PARTIALLY_REFUNDED: "partial" // NEW
}

// Update Sequelize model
status: {
  type: DataTypes.ENUM,
  values: [INITIATED, BOOKED, CANCELLED, PENDING, REFUNDED, PARTIALLY_REFUNDED]
}

// Create migration to alter enum column
```

**No Changes Needed In:**
- Repositories (use enum reference)
- Controllers (status passed as data)

### 12.2 Adding New Repository Methods

**Extension Point:** `BookingRepository`

**Example: Add getUserBookings**
```javascript
class BookingRepository extends CrudRepository {
  async getUserBookings(userId) {
    return this.model.findAll({
      where: { userId }
    });
  }
}
```

**Follows OCP:** Extends without modifying base CrudRepository

### 12.3 Adding Notification on Booking

**Extension Point:** `BookingService.createBooking()`

**Strategy Pattern Implementation:**
```javascript
// Define notification strategy interface
class NotificationStrategy {
  send(booking) { throw new Error("Not implemented"); }
}

class EmailNotification extends NotificationStrategy {
  send(booking) { /* send email */ }
}

class SMSNotification extends NotificationStrategy {
  send(booking) { /* send SMS */ }
}

// Inject into service
class BookingService {
  constructor(notificationStrategy) {
    this.notificationStrategy = notificationStrategy;
  }

  async createBooking(data) {
    const booking = await bookingRepository.createBooking(data);
    await this.notificationStrategy.send(booking); // NEW
    return booking;
  }
}
```

**Benefit:** Add notifications without modifying core booking logic

### 12.4 Adding Validation Middleware

**Extension Point:** `src/middlewares/`

**Example:**
```javascript
// src/middlewares/booking-validator.js
const { body, validationResult } = require('express-validator');

const validateCreateBooking = [
  body('flightId').isInt().notEmpty(),
  body('userId').isInt().notEmpty(),
  body('noOfSeats').isInt({ min: 1, max: 10 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Apply to route
router.post('/', validateCreateBooking, BookingController.createBooking);
```

**No Changes Needed In:** Controller or Service

### 12.5 Adding Authentication

**Extension Point:** `src/middlewares/auth.js`

**Example:**
```javascript
// Middleware to verify JWT token
const authenticate = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.userId = decoded.userId; // Attach user to request
    next();
  });
};

// Apply to routes
router.post('/', authenticate, BookingController.createBooking);
```

**Service Changes:** Use `req.userId` instead of `req.body.userId`

### 12.6 Switching Databases

**Extension Point:** Sequelize ORM abstraction

**How to Extend:**
- Update `src/config/config.json` with new database credentials
- Change `dialect` to 'postgres', 'sqlite', etc.
- No changes to repositories or models (Sequelize handles differences)

**Example:**
```json
{
  "development": {
    "username": "postgres",
    "password": "password",
    "database": "flights_db",
    "host": "localhost",
    "dialect": "postgres" // Changed from mysql
  }
}
```

### 12.7 Adding Caching Layer

**Extension Point:** Replace in-memory cache with Redis

**Example:**
```javascript
// src/utils/cache/redis-client.js
const redis = require('redis');
const client = redis.createClient();

async function cachePayment(key, value) {
  await client.set(key, JSON.stringify(value), 'EX', 3600); // 1 hour expiry
}

async function getCachedPayment(key) {
  const value = await client.get(key);
  return value ? JSON.parse(value) : null;
}

// Controller update
async function makePayment(req, res) {
  const idempotencyKey = req.headers["x-idempotency-key"];
  const cached = await getCachedPayment(idempotencyKey);
  if (cached) return res.status(200).json(cached);
  
  // ... process payment
  await cachePayment(idempotencyKey, response);
}
```

**Benefits:**
- Distributed cache works across multiple instances
- Survives service restarts
- Scales horizontally

### 12.8 Plugin Points Summary

| Feature | Extension Point | Pattern |
|---------|----------------|---------|
| New booking status | Enum + Model | Configuration |
| Notifications | Service injection | Strategy Pattern |
| Validation | Middleware | Chain of Responsibility |
| Authentication | Middleware | Decorator Pattern |
| Logging | Service methods | Aspect-Oriented Programming |
| Different database | Config + ORM | Adapter Pattern |
| Caching | Controller | Proxy Pattern |

---

## 13. Tradeoffs & Design Decisions

### 13.1 In-Memory Idempotency Cache

**Decision:** Use JavaScript object for caching idempotency keys

**Alternatives Considered:**
- Redis/Memcached (distributed cache)
- Database table for idempotency records
- No idempotency support

**Why Chosen:**
- Simplicity: No additional infrastructure needed
- Low latency: In-memory lookups are instant
- Proof-of-concept: Demonstrates idempotency pattern

**Limitations:**
- **Not horizontally scalable**: Different instances have separate caches
- **Not persistent**: Keys lost on service restart
- **Memory leak potential**: Cache grows indefinitely (no TTL)

**Production Recommendation:** Replace with Redis

### 13.2 15-Minute Payment Window

**Decision:** Bookings auto-cancel after 15 minutes without payment

**Alternatives Considered:**
- No timeout (indefinite hold)
- Shorter timeout (5 minutes)
- Configurable per user/flight

**Why Chosen:**
- Balances user convenience with inventory availability
- Prevents seat hoarding
- Industry standard for airline bookings

**Implementation Note:** Cron job uses 1 minute for testing/demo purposes

### 13.3 No Seat Restoration in Cron Job

**Decision:** Cron job cancels bookings but doesn't restore seats to Flight Service

**Alternatives Considered:**
- Restore seats immediately on cancellation
- Queue seat restoration requests
- Flight Service reconciles independently

**Why Chosen:**
- **Performance**: Batch update faster than individual API calls
- **Eventual consistency**: Assumes Flight Service has reconciliation logic
- **Reduces external dependencies**: Cron job doesn't fail if Flight Service down

**Limitation:** Temporary inconsistency between services

**When to Restore Seats:**
- Manual cancellations (before payment timeout) DO restore seats
- Ensures user-initiated actions are immediately consistent

### 13.4 Transaction Scope

**Decision:** Use database transactions for booking creation and payment, but include external API calls within transaction

**Alternatives Considered:**
- Saga pattern (distributed transactions)
- Two-phase commit
- No transactions

**Why Chosen:**
- **Simplicity**: Single service transaction easier to reason about
- **Atomicity**: Ensures database and external service stay in sync
- **Rollback**: If Flight Service update fails, booking not created

**Limitation:**
- **External service failure causes transaction rollback**: Long-running Flight Service calls hold database connections
- **Not truly distributed**: If Flight Service succeeds but local commit fails, inconsistency possible

**Production Recommendation:** Implement Saga pattern or event-driven consistency

### 13.5 Layered Architecture vs Microservices

**Decision:** Use layered monolith (single service)

**Alternatives Considered:**
- Separate microservices (Booking Service, Payment Service, Notification Service)
- Serverless functions (AWS Lambda)

**Why Chosen:**
- **Simplicity**: Easier to develop, test, and deploy
- **Low latency**: No network overhead for internal calls
- **Single transaction**: ACID guarantees within service
- **Right-sized**: Service scope is cohesive (booking domain)

**When to Split:**
- Payment processing becomes complex (different gateways, currencies)
- Notification logic requires separate scaling
- Different teams own different domains

### 13.6 Synchronous External API Calls

**Decision:** Make synchronous HTTP calls to Flight Service

**Alternatives Considered:**
- Asynchronous messaging (RabbitMQ, Kafka)
- Event-driven architecture
- GraphQL Federation

**Why Chosen:**
- **Strong consistency**: Need immediate seat availability check
- **Simplicity**: Request-response easier to implement
- **User experience**: User gets immediate feedback

**Limitation:**
- **Coupling**: Booking Service availability depends on Flight Service
- **Latency**: User waits for external call
- **Cascading failures**: Flight Service outage impacts bookings

**Production Recommendation:**
- Circuit breaker pattern (using libraries like `opossum`)
- Fallback mechanism (allow booking with pending seat confirmation)

### 13.7 No Input Validation Middleware

**Decision:** Validate inputs in service layer

**Alternatives Considered:**
- Validation middleware at controller level
- Schema validation (JSON Schema, Joi)

**Why Chosen:**
- **Simplicity**: Less boilerplate code
- **Business logic proximity**: Validation near business rules

**Limitation:**
- **Later error detection**: Invalid inputs reach service layer
- **Inconsistent error responses**: No standardized validation errors

**Production Recommendation:** Add validation middleware

### 13.8 Cron Job Every 10 Seconds

**Decision:** Run cancellation job every 10 seconds (frequent polling)

**Alternatives Considered:**
- Every 1 minute (less frequent)
- Event-driven (scheduled per booking)
- Database TTL (MySQL event scheduler)

**Why Chosen:**
- **Testing/demo**: Shows visible activity during development
- **Acceptable overhead**: Bulk query is efficient

**Limitation:**
- **Unnecessary database load**: Most executions find no expired bookings
- **Not precise**: Bookings may live up to 10 seconds past expiry

**Production Recommendation:** Every 1-5 minutes, or use database-native scheduling

### 13.9 No Test Coverage

**Decision:** No unit or integration tests in codebase

**Why:**
- Time constraint / proof-of-concept
- Focus on architecture demonstration

**Limitation:**
- **Refactoring risk**: No safety net for changes
- **Regression bugs**: Hard to verify fixes
- **Documentation gap**: Tests serve as usage examples

**Production Recommendation:** Add comprehensive test suite

---

## 14. Interview Revision Section

### Key Architectural Decisions

1. **Layered Architecture** with Controller → Service → Repository pattern
   - Clear separation of concerns
   - Each layer has single responsibility
   - Easy to test and maintain

2. **Repository Pattern** for data access abstraction
   - CrudRepository as base class
   - BookingRepository extends with domain-specific methods
   - Enables switching databases without changing business logic

3. **Transaction Management** for data consistency
   - Database transactions wrap multi-step operations
   - Rollback on any failure ensures atomicity
   - External API calls included in transaction scope

4. **Idempotency Support** for payment operations
   - Prevents duplicate payments on client retries
   - Uses idempotency keys (currently in-memory cache)
   - Critical for financial transactions

5. **Automated Lifecycle Management** via cron jobs
   - Cancels bookings after 15-minute payment window
   - Runs every 10 seconds (configurable)
   - Bulk update query for performance

6. **External Service Integration** with Flight Service
   - Validates seat availability before booking
   - Updates seat inventory atomically
   - Synchronous HTTP calls for strong consistency

### Design Patterns Used

| Pattern | Location | Purpose |
|---------|----------|---------|
| Repository | `CrudRepository`, `BookingRepository` | Abstract data access |
| Layered Architecture | Entire app structure | Separation of concerns |
| Template Method | `CrudRepository` base class | Reusable CRUD operations |
| Dependency Injection | Repository constructor | Loose coupling |
| Idempotency | Payment controller | Prevent duplicate processing |
| Unit of Work | Service transactions | Atomic multi-step operations |
| Facade | BookingService for Flight API | Simplify external calls |
| Custom Error Handling | AppError class | Standardized error responses |

### SOLID Principles

1. **SRP**: Each class has single responsibility (Controller handles HTTP, Service handles business logic, Repository handles data)
2. **OCP**: CrudRepository open for extension (inheritance), closed for modification
3. **LSP**: BookingRepository can substitute CrudRepository
4. **ISP**: Repositories expose only needed methods
5. **DIP**: Services depend on repository abstractions, not concrete implementations

### Scalability Decisions

1. **Horizontal Scaling Limitations**
   - In-memory idempotency cache prevents multiple instances
   - Solution: Replace with Redis

2. **Database Connection Pooling**
   - Sequelize manages pool (default 5 connections)
   - Can increase for higher load

3. **Stateless Service Design**
   - No session state stored in service
   - Enables load balancing across instances

4. **Bulk Operations**
   - Cron job uses single query for batch cancellations
   - Reduces database round trips

5. **Asynchronous I/O**
   - Node.js event loop handles concurrent requests
   - Non-blocking database and HTTP calls

### Clean Code Practices

1. **Meaningful Names**: `createBooking`, `makePayment`, `cancelOldBookings`
2. **Small Functions**: Each function does one thing
3. **DRY Principle**: CrudRepository eliminates duplicate CRUD code
4. **Error Handling**: Consistent AppError class with status codes
5. **Logging**: Winston logger for structured logging
6. **Configuration**: Environment variables for secrets
7. **API Versioning**: Routes under `/v1` for future versions

### Common Interview Questions

#### 1. **"How would you scale this system to handle 10,000 concurrent bookings?"**

**Answer:**
- Replace in-memory idempotency cache with **Redis** (distributed, persistent)
- Add **database read replicas** for read-heavy operations
- Implement **connection pooling** with higher limits
- Use **API Gateway** for rate limiting and load balancing
- Consider **message queue (RabbitMQ/Kafka)** for booking requests to decouple load
- Add **database indexing** on frequently queried columns (userId, flightId, status, createdAt)
- Implement **circuit breaker** for Flight Service calls to prevent cascading failures
- Use **horizontal pod autoscaling** in Kubernetes based on CPU/memory metrics

#### 2. **"What happens if the Flight Service is down when creating a booking?"**

**Answer:**
- Current behavior: Axios call fails → Transaction rolled back → Booking not created → HTTP 500 error to client
- **Improvements:**
  - **Circuit Breaker Pattern**: Fail fast after N failures, prevent overwhelming Flight Service
  - **Fallback Mechanism**: Allow "pending" bookings, reconcile later
  - **Retry with Exponential Backoff**: Retry transient failures (timeouts, 503)
  - **Event-Driven Architecture**: Publish booking request to queue, process asynchronously
  - **Monitoring & Alerts**: Notify ops team of Flight Service degradation

#### 3. **"How do you ensure no double-booking for the same seat?"**

**Answer:**
- **Flight Service Responsibility**: Seat-level locking handled by Flight Service (not this service)
- This service only specifies **number of seats**, not specific seat numbers
- **Transaction Isolation**: READ COMMITTED ensures consistent reads
- **Optimistic Locking**: Flight Service should use version column or CAS (Compare-And-Swap)
- **Pessimistic Locking**: Flight Service could use `SELECT ... FOR UPDATE` on seat inventory
- **Assumption**: Flight Service implements atomic decrement operation

#### 4. **"Why use layered architecture instead of hexagonal/clean architecture?"**

**Answer:**
- **Simplicity**: Layered architecture easier to understand for small-to-medium services
- **Clear flow**: Request flows top-down (Controller → Service → Repository)
- **Good enough**: Service scope is narrow (booking domain), no complex business rules
- **When to use Hexagonal/Clean**: 
  - Multiple adapters (REST, GraphQL, gRPC)
  - Complex domain logic with many use cases
  - Need to isolate domain from frameworks

#### 5. **"How would you add payment gateway integration (Stripe, PayPal)?"**

**Answer:**
- **Strategy Pattern**: Define `PaymentGateway` interface, implement `StripeGateway`, `PayPalGateway`
- **Dependency Injection**: Inject gateway into BookingService
- **Service Layer**: 
  ```javascript
  async makePayment(data, paymentGateway) {
    const result = await paymentGateway.charge(data.totalCost);
    if (result.success) {
      await bookingRepository.update({ status: BOOKED }, data.bookingId);
    }
  }
  ```
- **Configuration**: Select gateway via environment variable or per-request
- **Webhook Handling**: Add new endpoint for gateway callbacks (async payment confirmation)

#### 6. **"How would you implement seat selection (specific seat numbers)?"**

**Answer:**
- **Extend Booking Model**: Add `seatNumbers` array field
- **Flight Service Integration**: Pass selected seats in request
- **Validation**: Ensure seats available and match `noOfSeats`
- **Locking**: Flight Service must lock specific seats during booking
- **User Experience**: Frontend fetches seat map, user selects seats
- **Example Request**:
  ```json
  {
    "flightId": 101,
    "userId": 1001,
    "seatNumbers": ["12A", "12B"]
  }
  ```

#### 7. **"What if cron job takes longer than 10 seconds to execute?"**

**Answer:**
- **Current Risk**: Next execution overlaps, multiple jobs run concurrently
- **Solutions**:
  - **Job Locking**: Use flag `isJobRunning`, skip if true
  - **Distributed Lock**: Use Redis lock (for multiple instances)
  - **Database Advisory Locks**: PostgreSQL `pg_try_advisory_lock`
  - **Longer Interval**: Run every 1-5 minutes instead of 10 seconds
- **Monitoring**: Log job execution time, alert if exceeds threshold

#### 8. **"How would you test this service?"**

**Answer:**
- **Unit Tests**:
  - Test service methods in isolation (mock repositories, axios)
  - Test repository methods (in-memory SQLite or mock Sequelize)
  - Test error handling paths
- **Integration Tests**:
  - Test full request lifecycle (API → Database)
  - Use test database (cleared between tests)
  - Mock external Flight Service
- **E2E Tests**:
  - Test with real Flight Service (in test environment)
  - Verify transaction rollback scenarios
  - Test idempotency behavior
- **Tools**: Jest, Supertest, Sinon (mocking), Testcontainers (Docker DB)

#### 9. **"How do you prevent race conditions in concurrent bookings?"**

**Answer:**
- **Database Transactions**: Each booking runs in isolated transaction
- **Flight Service Atomicity**: Assumes Flight Service uses atomic operations
- **Optimistic Concurrency**: Could add `version` column to Booking model
- **Pessimistic Locking**: Use `SELECT ... FOR UPDATE` when reading booking for payment
- **Example**:
  ```javascript
  const booking = await Booking.findByPk(id, {
    lock: transaction.LOCK.UPDATE,
    transaction
  });
  ```
- **Idempotency**: Payment endpoint uses idempotency keys

#### 10. **"What observability would you add to this service?"**

**Answer:**
- **Logging**: Already has Winston logger, add:
  - Structured logs (JSON format)
  - Request ID correlation
  - Log levels (DEBUG, INFO, ERROR)
- **Metrics**:
  - Booking creation rate (requests/sec)
  - Payment success rate
  - External API latency (Flight Service)
  - Database query duration
  - Active transaction count
- **Tracing**: Add distributed tracing (Jaeger, Zipkin)
  - Trace booking flow across services
  - Identify bottlenecks
- **Health Checks**: Add `/health` endpoint
  - Check database connectivity
  - Check Flight Service availability
- **Tools**: Prometheus, Grafana, ELK Stack

#### 11. **"How would you handle partial failures (booking created, but seat update fails)?"**

**Answer:**
- **Current Behavior**: Transaction rolled back, booking not created
- **Problem**: If network fails AFTER Flight Service updates seats but BEFORE commit
- **Solutions**:
  - **Saga Pattern**: Compensating transactions (create reverse operation)
  - **Outbox Pattern**: Store booking and seat update as events, process atomically
  - **Event Sourcing**: Store booking events, rebuild state from events
  - **Idempotent Retry**: Flight Service seat update should be idempotent
  - **Eventual Consistency**: Accept temporary inconsistency, reconcile via background job

#### 12. **"Explain the booking lifecycle state machine"**

**Answer:**
```
[initiated] ──(payment within 15 min)──> [booked]
     │
     ├──(timeout > 15 min)──> [cancelled]
     │
     └──(manual cancel)──> [cancelled]

Terminal states: [booked], [cancelled]
```
- **initiated**: Seats reserved, awaiting payment
- **booked**: Payment successful, booking confirmed
- **cancelled**: Payment timeout or manual cancellation, seats released
- **pending**: (Currently unused, could be used for async payment processing)

---

## Conclusion

This Flight Booking Service demonstrates a well-structured, maintainable architecture suitable for microservices environments. The layered design with clear separation of concerns, combined with transactional consistency and idempotency support, provides a solid foundation for a production-ready booking system.

### Key Strengths
- Clear architectural boundaries (Controller/Service/Repository)
- Transaction management for data consistency
- Idempotent payment processing
- Automated booking lifecycle management
- Integration with external services

### Areas for Production Enhancement
- Replace in-memory cache with Redis for horizontal scaling
- Add comprehensive test coverage (unit, integration, E2E)
- Implement validation middleware for input sanitization
- Add circuit breaker for external service resilience
- Implement distributed tracing and metrics
- Add authentication and authorization middleware
- Use Saga pattern for distributed transaction handling
- Implement proper seat restoration in cron jobs

This design is interview-ready and demonstrates understanding of:
- Software design patterns
- SOLID principles
- Distributed system challenges
- Scalability considerations
- Production-readiness requirements

---

**Author**: Senior Software Architect  
**Last Updated**: February 16, 2026  
**Version**: 1.0
