/** Prints the character list as JSON for scripts/assets/build_avatars.py (Blender). */
import { CHARACTER_AVATARS, AVATAR_AURAS } from '../../utils/characterAvatars';

console.log(JSON.stringify({ chars: CHARACTER_AVATARS, auras: AVATAR_AURAS }));
