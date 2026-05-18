import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { User, IGeofence } from '../models/user.model.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';

const router = Router();
router.use(requireAuth);

// PATCH /api/v1/privacy — update own privacy settings
router.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    if (!user) return next(new NotFoundError('User not found'));

    if (user.restrictedMode) {
      return next(new ForbiddenError('Cannot change privacy settings in restricted mode'));
    }

    const allowedPrivacyFields = [
      'privacyLocation',
      'privacyBattery',
      'privacyOnlineStatus',
      'privacyLastSeen',
      'privacyProfile',
    ] as const;

    const validLevels = ['everyone', 'contacts', 'nobody'];
    const update: Record<string, unknown> = {};

    for (const field of allowedPrivacyFields) {
      const val = (req.body as Record<string, unknown>)[field];
      if (val !== undefined) {
        if (!validLevels.includes(val as string)) {
          return next(new BadRequestError(`Invalid value for ${field}`));
        }
        update[field] = val;
      }
    }

    const updated = await User.findByIdAndUpdate(userId, update, { new: true })
      .select('-passwordHash -deletedAt')
      .lean();

    res.json({
      privacyLocation: updated!.privacyLocation,
      privacyBattery: updated!.privacyBattery,
      privacyOnlineStatus: updated!.privacyOnlineStatus,
      privacyLastSeen: updated!.privacyLastSeen,
      privacyProfile: updated!.privacyProfile,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/privacy/notifications — update notification preferences
router.patch('/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const {
      pushEnabled,
      newMessages,
      missedCalls,
      locationRequests,
      lowBatteryAlerts,
    } = req.body as Record<string, boolean>;

    const prefUpdate: Record<string, unknown> = {};
    const fields = { pushEnabled, newMessages, missedCalls, locationRequests, lowBatteryAlerts };
    for (const [key, val] of Object.entries(fields)) {
      if (typeof val === 'boolean') {
        prefUpdate[`notificationPrefs.${key}`] = val;
      }
    }

    const updated = await User.findByIdAndUpdate(userId, prefUpdate, { new: true })
      .select('notificationPrefs')
      .lean();

    res.json({ notificationPrefs: updated!.notificationPrefs });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/privacy/safety — update SOS presets, auto-SOS, emergency contacts
router.patch('/safety', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const { sosMessagePresets, autoSosEnabled, autoSosThresholdHours, emergencyContacts } =
      req.body as {
        sosMessagePresets?: string[];
        autoSosEnabled?: boolean;
        autoSosThresholdHours?: number;
        emergencyContacts?: string[];
      };

    const update: Record<string, unknown> = {};
    if (Array.isArray(sosMessagePresets)) update.sosMessagePresets = sosMessagePresets.slice(0, 5);
    if (typeof autoSosEnabled === 'boolean') update.autoSosEnabled = autoSosEnabled;
    if (typeof autoSosThresholdHours === 'number' && autoSosThresholdHours >= 1) {
      update.autoSosThresholdHours = autoSosThresholdHours;
    }
    if (Array.isArray(emergencyContacts)) {
      update.emergencyContacts = emergencyContacts.map((id) => new Types.ObjectId(id));
    }

    const updated = await User.findByIdAndUpdate(userId, update, { new: true })
      .select('sosMessagePresets autoSosEnabled autoSosThresholdHours emergencyContacts')
      .lean();

    res.json({
      sosMessagePresets: updated!.sosMessagePresets,
      autoSosEnabled: updated!.autoSosEnabled,
      autoSosThresholdHours: updated!.autoSosThresholdHours,
      emergencyContacts: updated!.emergencyContacts?.map(String),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/privacy/me — get all privacy/settings for own profile
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId)
      .select('-passwordHash -deletedAt')
      .lean();
    if (!user) return next(new NotFoundError('User not found'));

    res.json({
      privacyLocation: user.privacyLocation,
      privacyBattery: user.privacyBattery,
      privacyOnlineStatus: user.privacyOnlineStatus,
      privacyLastSeen: user.privacyLastSeen,
      privacyProfile: user.privacyProfile,
      notificationPrefs: user.notificationPrefs,
      sosMessagePresets: user.sosMessagePresets ?? [],
      emergencyContacts: user.emergencyContacts?.map(String) ?? [],
      guardianIds: user.guardianIds?.map(String) ?? [],
      autoSosEnabled: user.autoSosEnabled,
      autoSosThresholdHours: user.autoSosThresholdHours,
      restrictedMode: user.restrictedMode,
      geofences: user.geofences ?? [],
      locationSharingActive: user.locationSharingActive,
      locationSharingRooms: user.locationSharingRooms?.map(String) ?? [],
      locationSharingContacts: user.locationSharingContacts?.map(String) ?? [],
      locationHistory: user.locationHistory,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/privacy/location — update location sharing settings
router.patch('/location', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId);
    if (!user) return next(new NotFoundError('User not found'));

    if (user.restrictedMode) {
      return next(new ForbiddenError('Cannot change location settings in restricted mode'));
    }

    const { locationSharingActive, locationSharingRooms, locationSharingContacts, locationHistory } =
      req.body as {
        locationSharingActive?: boolean;
        locationSharingRooms?: string[];
        locationSharingContacts?: string[];
        locationHistory?: number;
      };

    const update: Record<string, unknown> = {};
    if (typeof locationSharingActive === 'boolean') update.locationSharingActive = locationSharingActive;
    if (Array.isArray(locationSharingRooms)) {
      update.locationSharingRooms = locationSharingRooms.map((id) => new Types.ObjectId(id));
    }
    if (Array.isArray(locationSharingContacts)) {
      update.locationSharingContacts = locationSharingContacts.map((id) => new Types.ObjectId(id));
    }
    if (typeof locationHistory === 'number' && [7, 14, 30, 90].includes(locationHistory)) {
      update.locationHistory = locationHistory;
    }

    const updated = await User.findByIdAndUpdate(userId, update, { new: true })
      .select('locationSharingActive locationSharingRooms locationSharingContacts locationHistory')
      .lean();

    res.json({
      locationSharingActive: updated!.locationSharingActive,
      locationSharingRooms: updated!.locationSharingRooms?.map(String) ?? [],
      locationSharingContacts: updated!.locationSharingContacts?.map(String) ?? [],
      locationHistory: updated!.locationHistory,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/privacy/guardians/:targetUserId — add self as guardian of target (target must accept)
// For simplicity in this version, we directly add the guardian relationship
router.post('/guardians/:targetUserId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const guardianId = req.user!._id;
    const { targetUserId } = req.params;

    if (!Types.ObjectId.isValid(targetUserId as string)) {
      return next(new BadRequestError('Invalid user ID'));
    }

    const target = await User.findById(targetUserId);
    if (!target) return next(new NotFoundError('User not found'));

    const alreadyGuardian = target.guardianIds.some((id) => id.toString() === guardianId);
    if (!alreadyGuardian) {
      await User.findByIdAndUpdate(targetUserId, {
        $addToSet: { guardianIds: new Types.ObjectId(guardianId) },
      });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/privacy/guardians/:guardianId — remove a guardian from own account
router.delete('/guardians/:guardianId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const { guardianId } = req.params;

    if (!Types.ObjectId.isValid(guardianId as string)) {
      return next(new BadRequestError('Invalid guardian ID'));
    }

    await User.findByIdAndUpdate(userId, {
      $pull: { guardianIds: new Types.ObjectId(guardianId as string) },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/privacy/restricted-mode — guardian toggles restricted mode on a child user
router.patch('/restricted-mode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const guardianId = req.user!._id;
    const { targetUserId, enabled } = req.body as { targetUserId: string; enabled: boolean };

    if (!Types.ObjectId.isValid(targetUserId)) {
      return next(new BadRequestError('Invalid targetUserId'));
    }
    if (typeof enabled !== 'boolean') {
      return next(new BadRequestError('enabled (boolean) is required'));
    }

    const target = await User.findById(targetUserId);
    if (!target) return next(new NotFoundError('User not found'));

    const isGuardian = target.guardianIds.some((id) => id.toString() === guardianId);
    if (!isGuardian) {
      return next(new ForbiddenError('You are not a guardian of this user'));
    }

    await User.findByIdAndUpdate(targetUserId, { restrictedMode: enabled });

    // Notify child via socket if connected
    const io = getIo();
    if (io) {
      io.to(`user:${targetUserId}`).emit('restricted_mode_changed', { enabled });
    }

    res.json({ ok: true, restrictedMode: enabled });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/privacy/geofences — list own geofences
router.get('/geofences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const user = await User.findById(userId).select('geofences').lean();
    res.json({ geofences: user?.geofences ?? [] });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/privacy/geofences — add a geofence zone
router.post('/geofences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const { name, lat, lng, radiusMetres, alertOnExit = true, alertOnEntry = false, targetUserId } =
      req.body as Partial<IGeofence> & { targetUserId?: string };

    if (!name || typeof lat !== 'number' || typeof lng !== 'number' || typeof radiusMetres !== 'number') {
      return next(new BadRequestError('name, lat, lng, radiusMetres are required'));
    }
    if (radiusMetres < 10) {
      return next(new BadRequestError('radiusMetres must be at least 10'));
    }

    // Guardian can add geofence to a child; otherwise add to own profile
    let targetId = userId;
    if (targetUserId) {
      if (!Types.ObjectId.isValid(targetUserId)) {
        return next(new BadRequestError('Invalid targetUserId'));
      }
      const target = await User.findById(targetUserId);
      if (!target) return next(new NotFoundError('Target user not found'));
      const isGuardian = target.guardianIds.some((id) => id.toString() === userId);
      if (!isGuardian) {
        return next(new ForbiddenError('You are not a guardian of this user'));
      }
      targetId = targetUserId;
    }

    const newZone: IGeofence = { name, lat, lng, radiusMetres, alertOnExit, alertOnEntry };
    const updated = await User.findByIdAndUpdate(
      targetId,
      { $push: { geofences: newZone } },
      { new: true },
    ).select('geofences').lean();

    res.status(201).json({ geofences: updated!.geofences });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/privacy/geofences/:geofenceId — remove a geofence
router.delete('/geofences/:geofenceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const { geofenceId } = req.params;
    const { targetUserId } = req.query as { targetUserId?: string };

    let targetId = userId;
    if (targetUserId) {
      if (!Types.ObjectId.isValid(targetUserId)) {
        return next(new BadRequestError('Invalid targetUserId'));
      }
      const target = await User.findById(targetUserId);
      if (!target) return next(new NotFoundError('Target user not found'));
      const isGuardian = target.guardianIds.some((id) => id.toString() === userId);
      if (!isGuardian) {
        return next(new ForbiddenError('You are not a guardian of this user'));
      }
      targetId = targetUserId;
    }

    await User.findByIdAndUpdate(targetId, {
      $pull: { geofences: { _id: new Types.ObjectId(geofenceId as string) } },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
