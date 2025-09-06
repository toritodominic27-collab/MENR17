# MERAC

## Overview

MERAC is a financial investment platform built with a Node.js backend and vanilla HTML/CSS/JavaScript frontend. The application provides user registration, investment tracking, referral systems, news feeds, team management, and reporting capabilities. It features a modern glassmorphic UI design with Arabic language support and uses file-based JSON storage for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Technology Stack**: Vanilla HTML, CSS, and JavaScript with no frontend frameworks
- **UI Design**: Glassmorphic design system with CSS custom properties for theming
- **Multi-language Support**: Supports both English (LTR) and Arabic (RTL) layouts
- **Responsive Design**: Mobile-first approach with CSS Grid and Flexbox
- **Icon System**: Lucide icons for consistent iconography
- **Charting**: Chart.js integration for data visualization and reports

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **API Design**: RESTful API structure with JSON responses
- **Middleware Stack**: CORS enabled, JSON body parsing, static file serving
- **Error Handling**: Basic error responses with HTTP status codes
- **File Structure**: Modular organization with separate public assets

### Data Storage
- **Primary Storage**: File-based JSON storage (`data.json`)
- **Data Operations**: Synchronous file read/write operations
- **Schema**: Simple user objects with fields for authentication, profile data, and referral tracking
- **Backup Strategy**: No automated backup system currently implemented

### Authentication & Authorization
- **Authentication Method**: Simple password-based authentication
- **Session Management**: No session management or JWT tokens implemented
- **Password Security**: Plain text password storage (security concern)
- **User Registration**: Email uniqueness validation and basic field validation

### Application Features
- **User Management**: Registration, login, and profile management
- **Investment Tracking**: Investment plans and portfolio management
- **Referral System**: User referral tracking with referral codes
- **News System**: Financial news and updates display
- **Reporting**: Charts and analytics for user data
- **Support System**: Help desk and customer support features
- **Team Management**: Team structure and hierarchy management

### Security Considerations
- **Data Validation**: Basic input validation on registration
- **CORS Policy**: Enabled for cross-origin requests
- **File Access**: Direct file system access without access controls
- **Password Storage**: No encryption or hashing implemented (critical security issue)

## External Dependencies

### NPM Packages
- **express**: Web framework for Node.js
- **cors**: Cross-Origin Resource Sharing middleware
- **fs**: File system operations (Node.js built-in)
- **path**: File path utilities (Node.js built-in)

### Frontend Libraries
- **Lucide Icons**: Icon library loaded via CDN
- **Chart.js**: Charting library for data visualization
- **Google Fonts**: Poppins font family for typography

### Development Environment
- **Runtime**: Node.js environment
- **Port Configuration**: Configurable via environment variable (default: 5000)
- **Static Assets**: Served from public directory
- **File Storage**: Local file system for data persistence

### Browser Requirements
- **Modern Browser Support**: ES6+ JavaScript features
- **CSS Features**: CSS Grid, Flexbox, CSS Custom Properties
- **RTL Support**: Right-to-left text direction for Arabic content
- **Responsive Design**: Mobile and desktop viewport support