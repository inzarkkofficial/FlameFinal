import { useState } from "react";
import { motion } from "framer-motion";

const LOGO_SRC = "/flame-logo.gif";

// Icon Components
const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

const MailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
  </svg>
);

const LockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const MeetPeopleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

const MatchInstantlyIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"></path>
  </svg>
);

const StartChattingIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
    <path d="M8 9h8"></path>
    <path d="M8 13h5"></path>
  </svg>
);

const LOGIN_HERO_FEATURES = [
  {
    title: "Meet People",
    text: "Connect with amazing people nearby.",
    Icon: MeetPeopleIcon
  },
  {
    title: "Match Instantly",
    text: "Find matches based on your interests.",
    Icon: MatchInstantlyIcon
  },
  {
    title: "Start Chatting",
    text: "Break the ice and build real connections.",
    Icon: StartChattingIcon
  }
];

function calculateAgeFromBirthDate(value) {
  const birthDate = new Date(value);
  if (!value || Number.isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

function AuthDesktopStage({ ctaText, ctaLabel, onCta }) {
  return (
    <>
      <div className="auth-desktop-ambient" aria-hidden="true">
        <span className="auth-ambient-orb orb-one"></span>
        <span className="auth-ambient-orb orb-two"></span>
        <span className="auth-ambient-orb orb-three"></span>
        <span className="auth-particle particle-one"></span>
        <span className="auth-particle particle-two"></span>
        <span className="auth-particle particle-three"></span>
        <span className="auth-particle particle-four"></span>
      </div>

      <motion.section
        className="auth-desktop-hero"
        aria-label="Flame welcome"
        initial={{ opacity: 0, x: -22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="auth-desktop-brand">
          <span className="auth-desktop-brand-mark">
            <img src={LOGO_SRC} alt="" />
          </span>
          <span>Flame</span>
        </div>

        <div className="auth-hero-content">
          <p className="auth-hero-kicker">Date nearby with confidence</p>
          <h2 className="auth-hero-headline">
            <span>Meet. Match. Chat.</span>
            <strong>Find your spark.</strong>
          </h2>
          <p className="auth-hero-subtitle">
            Flame helps you connect with people nearby who share your vibe.
          </p>

          <div className="auth-hero-visual" aria-hidden="true">
            <span className="auth-orbit orbit-one"></span>
            <span className="auth-orbit orbit-two"></span>
            <span className="auth-orbit orbit-three"></span>
            <span className="auth-heart auth-heart-main"></span>
            <span className="auth-heart auth-heart-warm"></span>
            <span className="auth-spark spark-one"></span>
            <span className="auth-spark spark-two"></span>
            <span className="auth-spark spark-three"></span>
          </div>
        </div>

        <div className="auth-hero-features">
          {LOGIN_HERO_FEATURES.map(({ title, text, Icon }) => (
            <div className="auth-feature-card" key={title}>
              <span className="auth-feature-icon">
                <Icon />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </motion.section>

      <div className="auth-desktop-top-action">
        <span>{ctaText}</span>
        <button type="button" onClick={onCta}>{ctaLabel}</button>
      </div>
    </>
  );
}

export function LoginPage({ onLogin, onSwitchToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    const result = await onLogin({ email, password });
    setError(result.ok ? "" : result.error);
    setLoading(false);
  };

  return (
    <div className="auth-page login-page">
      <AuthDesktopStage ctaText="New here?" ctaLabel="Sign Up" onCta={onSwitchToSignup} />

      <motion.div
        className="auth-container"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.36, ease: "easeOut" }}
      >
        {/* Back Button */}
        <button className="auth-back-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>

        {/* Logo Section */}
        <div className="auth-logo-section">
          <div className="auth-logo-wrapper">
            <img src={LOGO_SRC} alt="Flame" className="auth-logo" />
          </div>
          <h1 className="auth-title">Flame</h1>
          <p className="auth-subtitle">Swipe, match, and chat with people nearby.</p>
        </div>

        {/* Tab Buttons */}
        <div className="auth-tabs">
          <button className="auth-tab active">Log In</button>
          <button className="auth-tab" onClick={onSwitchToSignup}>Sign Up</button>
        </div>

          {/* Form */}
          <div className="auth-form">
          {error && <div className="form-error">{error}</div>}

          {/* Email Field */}
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <div className="auth-input-group">
              <MailIcon />
              <input
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-group">
              <LockIcon />
              <input
                type={showPassword ? "text" : "password"}
                className="auth-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* Forgot Password */}
          <button className="auth-forgot-password">Forgot Password?</button>

          {/* Login Button */}
          <button 
            className="auth-primary-btn" 
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? "Logging In..." : "Log In"}
          </button>

          {/* Continue With */}
          <div className="auth-divider">or continue with</div>

          {/* Social Login */}
          <div className="auth-social">
            <button className="auth-social-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" fill="#4285F4"/>
              </svg>
              <span>Google</span>
            </button>
            <button className="auth-social-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <circle cx="12" cy="12" r="10"/>
              </svg>
              <span>Apple</span>
            </button>
          </div>

        </div>

        {/* Security Message */}
        <div className="auth-security">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Your data is safe with us
        </div>

        {/* Progress Bar */}
        <div className="auth-progress-bar"></div>
      </motion.div>
    </div>
  );
}

export function SignupPage({ onSignup, onSwitchToLogin }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("");
  const [interestedIn, setInterestedIn] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const calculatedAge = calculateAgeFromBirthDate(birthDate);

  const handleSignup = async () => {
    setError("");
    if (calculatedAge !== "" && calculatedAge < 18) {
      setError("You must be at least 18 years old to sign up.");
      return;
    }
    const cleanGender = gender.trim();
    const cleanInterestedIn = interestedIn.trim();
    if (!cleanGender || !cleanInterestedIn) {
      setError("Please choose your gender and who you're interested in.");
      return;
    }
    setLoading(true);
    const result = await onSignup({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      birthDate,
      age: calculatedAge || 18,
      gender: cleanGender,
      interestedIn: cleanInterestedIn
    });
    setError(result.ok ? "" : result.error);
    setLoading(false);
  };

  return (
    <div className="auth-page signup-page">
      <AuthDesktopStage ctaText="Already have an account?" ctaLabel="Log In" onCta={onSwitchToLogin} />

      <motion.div
        className="auth-container"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.36, ease: "easeOut" }}
      >
        {/* Logo Section */}
        <div className="auth-logo-section">
          <div className="auth-logo-wrapper">
            <img src={LOGO_SRC} alt="Flame" className="auth-logo" />
          </div>
          <h1 className="auth-title">Flame</h1>
          <p className="auth-subtitle">Create your account and start connecting.</p>
        </div>

        {/* Tab Buttons */}
        <div className="auth-tabs">
          <button className="auth-tab" onClick={onSwitchToLogin}>Log In</button>
          <button className="auth-tab active">Sign Up</button>
        </div>

          {/* Form */}
          <div className="auth-form">
          {error && <div className="form-error">{error}</div>}

          {/* Full Name Field */}
          <div className="auth-field">
            <label className="auth-label">Full Name</label>
            <div className="auth-input-group">
              <UserIcon />
              <input
                type="text"
                className="auth-input"
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          {/* Email Field */}
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <div className="auth-input-group">
              <MailIcon />
              <input
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className="auth-input-group">
              <LockIcon />
              <input
                type={showPassword ? "text" : "password"}
                className="auth-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="auth-password-status">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#42d37b"/>
                <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Password looks good!
            </div>
          </div>

          {/* Birth Date Field */}
          <div className="auth-field">
            <label className="auth-label">Date of Birth</label>
            <div className="auth-input-group">
              <CalendarIcon />
              <input
                type="date"
                className="auth-input"
                placeholder="Birthday"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            {calculatedAge !== "" && (
              <div className="auth-password-status">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#42d37b"/>
                  <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Age: {calculatedAge}
              </div>
            )}
          </div>

          {/* Gender Selection */}
          <div className="auth-field">
            <label className="auth-label">I am</label>
            <div className="auth-options">
              {["woman", "man", "non-binary"].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`auth-option ${gender === option ? "active" : ""}`}
                  onClick={() => setGender(option)}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Interested In Selection */}
          <div className="auth-field">
            <label className="auth-label">Interested in</label>
            <div className="auth-options">
              {["men", "women", "everyone"].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`auth-option ${interestedIn === option ? "active" : ""}`}
                  onClick={() => setInterestedIn(option)}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Create Account Button */}
          <button 
            className="auth-primary-btn" 
            type="button"
            onClick={handleSignup}
            disabled={loading}
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>

          {/* Continue With */}
          <div className="auth-divider">or continue with</div>

          {/* Social Login */}
          <div className="auth-social">
            <button className="auth-social-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="10" fill="#4285F4"/>
              </svg>
              <span>Google</span>
            </button>
            <button className="auth-social-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <circle cx="12" cy="12" r="10"/>
              </svg>
              <span>Apple</span>
            </button>
          </div>
        </div>

        {/* Terms and Security */}
        <div className="auth-terms">
          <p>By signing up, you agree to our <span className="auth-link">Terms of Service</span> and <span className="auth-link">Privacy Policy</span></p>
        </div>

        <div className="auth-security">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Your data is safe with us
        </div>

        {/* Progress Bar */}
        <div className="auth-progress-bar"></div>
      </motion.div>
    </div>
  );
}
