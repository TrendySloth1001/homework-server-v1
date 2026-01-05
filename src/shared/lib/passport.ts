/**
 * Passport Configuration for Google OAuth
 */

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config';
import { GoogleProfile } from '../../features/auth/auth.types';

export function configurePassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.auth.google.clientId,
        clientSecret: config.auth.google.clientSecret,
        callbackURL: config.auth.google.callbackUrl,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Transform passport profile to our GoogleProfile type
          const googleProfile: GoogleProfile = {
            id: profile.id,
            displayName: profile.displayName,
            emails: profile.emails?.map((email) => ({
              value: email.value,
              verified: email.verified || false,
            })),
            photos: profile.photos?.map((photo) => ({
              value: photo.value,
            })),
          };

          return done(null, googleProfile);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );

  // Serialize user for session (not used in JWT approach, but required by passport)
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: Express.User, done) => {
    done(null, user);
  });
}
