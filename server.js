import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

// Import routes
import authRoutes from './src/routes/auth.js';
import userRoutes from './src/routes/users.js';
import serviceRoutes from './src/routes/services.js';
import truckRoutes from './src/routes/trucks.js';
import messageRoutes from './src/routes/messages.js';
import pickupRoutes from './src/routes/pickups.js';
import branchRoutes from './src/routes/branches.js';
import bookingRoutes from './src/routes/bookings.js';
import analyticsRoutes from './src/routes/analytics.js';
import dashboardRoutes from './src/routes/dashboard.js';
import locationRoutes from './src/routes/locations.js';

// Import middleware
import { authenticateToken } from './src/middleware/auth.js';
import { errorHandler } from './src/middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Database connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://velo-manage-clean4.vercel.app', // production frontend
  ],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// API Routes
const apiVersion = process.env.API_VERSION || 'v1';
app.use(`/api/${apiVersion}/auth`, authRoutes);
app.use(`/api/${apiVersion}/users`, authenticateToken, userRoutes);
app.use(`/api/${apiVersion}/services`, authenticateToken, serviceRoutes);
app.use(`/api/${apiVersion}/trucks`, authenticateToken, truckRoutes);
app.use(`/api/${apiVersion}/messages`, authenticateToken, messageRoutes);
app.use(`/api/${apiVersion}/pickups`, authenticateToken, pickupRoutes);
app.use(`/api/${apiVersion}/branches`, authenticateToken, branchRoutes);
app.use(`/api/${apiVersion}/bookings`, authenticateToken, bookingRoutes);
app.use(`/api/${apiVersion}/analytics`, authenticateToken, analyticsRoutes);
app.use(`/api/${apiVersion}/dashboard`, authenticateToken, dashboardRoutes);
app.use(`/api/${apiVersion}/locations`, authenticateToken, locationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: apiVersion
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'AutoCare Pro API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: `/api/${apiVersion}/auth`,
      users: `/api/${apiVersion}/users`,
      services: `/api/${apiVersion}/services`,
      trucks: `/api/${apiVersion}/trucks`,
      messages: `/api/${apiVersion}/messages`,
      pickups: `/api/${apiVersion}/pickups`,
      branches: `/api/${apiVersion}/branches`,
      bookings: `/api/${apiVersion}/bookings`,
      analytics: `/api/${apiVersion}/analytics`,
      dashboard: `/api/${apiVersion}/dashboard`
    }
  });
});

// Socket.io handling
io.on('connection', (socket) => {
  console.log('👤 User connected:', socket.id);

  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`👤 User ${userId} joined their room`);
  });

  socket.on('join-admin-room', () => {
    socket.join('admin-room');
    console.log('👨‍💼 Admin joined admin room');
  });

  socket.on('truck-location-update', (data) => {
    socket.broadcast.emit('truck-location-updated', data);
  });

  socket.on('new-message', (data) => {
    if (data.recipientType === 'admin') {
      socket.to('admin-room').emit('message-received', data);
    } else {
      socket.to(`user-${data.recipientId}`).emit('message-received', data);
    }
  });

  socket.on('new-pickup-request', (data) => {
    socket.to('admin-room').emit('pickup-request-received', data);
  });

  socket.on('truck-dispatched', (data) => {
    socket.to(`user-${data.userId}`).emit('truck-dispatch-update', data);
  });

  socket.on('disconnect', () => {
    console.log('👤 User disconnected:', socket.id);
  });
});

// Make io available to routes
app.set('socketio', io);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The requested route ${req.originalUrl} does not exist.`
  });
});

const PORT = process.env.PORT || 3001;
const API_PUBLIC_URL = process.env.VITE_PROD_API_URL || `http://localhost:${PORT}/api/${apiVersion}`;

server.listen(PORT, () => {
  console.log(`🚀 AutoCare Pro Backend Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 API Base URL: ${API_PUBLIC_URL}`);
  console.log(`🔧 Health Check: ${API_PUBLIC_URL.replace(`/api/${apiVersion}`, '/health')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

export default app;
