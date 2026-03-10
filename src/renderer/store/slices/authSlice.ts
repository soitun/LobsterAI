import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface UserProfile {
  userId: string;
  phone: string;
  nickname: string;
  avatarUrl: string;
}

export interface UserQuota {
  dailyLimit: number;
  dailyUsed: number;
  planName: string | null; // null = free tier
  creditsBalance: number;
}

interface AuthState {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  quota: UserQuota | null;
}

const initialState: AuthState = {
  isLoggedIn: false,
  isLoading: true,
  user: null,
  quota: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setLoggedIn(state, action: PayloadAction<{ user: UserProfile; quota: UserQuota }>) {
      state.isLoggedIn = true;
      state.isLoading = false;
      state.user = action.payload.user;
      state.quota = action.payload.quota;
    },
    setLoggedOut(state) {
      state.isLoggedIn = false;
      state.isLoading = false;
      state.user = null;
      state.quota = null;
    },
    updateQuota(state, action: PayloadAction<UserQuota>) {
      state.quota = action.payload;
    },
  },
});

export const { setAuthLoading, setLoggedIn, setLoggedOut, updateQuota } = authSlice.actions;
export default authSlice.reducer;
