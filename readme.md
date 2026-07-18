Eyeziyo Android MVP - Functional Documentation
1. Project Overview
Eyeziyo is an AI-based lesson quality analytics platform designed for education centers. The
Android MVP focuses on two main user roles: Teacher and Administrator. The goal is to digitize
lesson monitoring, generate engagement analytics, and provide actionable feedback.
2. User Roles
Teacher: Records lessons, views AI-generated engagement analytics, and tracks personal history.
Administrator: Monitors overall school performance, teacher engagement scores, and lesson
statistics.
3. Authentication & Access Control
Users log in with email and password. The system assigns role-based navigation:
- Teacher users are redirected to Teacher Dashboard.
- Administrator users are redirected to Admin Dashboard.
Future version: JWT-based authentication with backend API.
4. Teacher Functionalities
- Start Lesson Recording
- Real-time recording timer
- Stop recording
- Generate AI-based analytics (mock in MVP)
- View Engagement Score (0–100%)
- View Interaction Level (Low/Medium/High)
- View Speech Balance (Teacher vs Student ratio)
- View recording history
Future: Upload audio to cloud for AI processing.
5. Admin Functionalities
- View Overall School Engagement Score
- View Average Teacher Performance
- View Teacher List with Scores
- Color-coded indicators (Green/Yellow/Red)
- View last lesson date per teacher
Future: Trend analytics and downloadable reports.
6. AI Scoring Logic (MVP Simulation)
Since MVP does not connect to real AI yet, the system simulates:
- Random engagement score generation
- Categorization thresholds
- Mock speech ratio calculation
Future: Real AI integration using speech-to-text and NLP analysis.
7. System Architecture (MVP)
- Android Mobile App (React Native or native Android)
- Local state management
- Mock data storage
Future Architecture:
- Mobile App → Backend API → AI Processing Service → Database
- Cloud storage for audio files
- Analytics engine for scoring.
8. Security Considerations
- Secure authentication in future
- Encrypted audio upload
- Role-based data access
- GDPR-compliant data handling (future scaling).
9. Scalability Roadmap
Phase 1: MVP – Local mock AI
Phase 2: Cloud-based audio analysis
Phase 3: Real-time analytics dashboard
Phase 4: Multi-school SaaS platform
Phase 5: Regional expansion.
10. Competitive Differentiation
- Mobile-first lightweight model
- Software-only approach (no mandatory hardware)
- Focus on pedagogical scoring, not just monitoring
- SaaS scalability model.
11. Future Enhancements
- Real AI transcription
- Teacher improvement recommendations
- Parent-facing analytics
- Gamification and performance ranking
- Automated retention prediction.