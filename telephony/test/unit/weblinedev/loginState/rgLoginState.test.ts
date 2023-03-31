import {
  consolidateRgLoginOpStatus,
  consolidateRgLoginState,
  RgLoginState,
  RgLoginStatus,
  RgOpStatus,
} from '@src/weblinedev/loginState/rgLoginState';

describe('rgLoginState tests', () => {
  describe('ringgroup state consolidation', () => {
    test('default state', () => {
      const states: RgLoginState[] = [];
      const state = consolidateRgLoginState(states);

      expect(state).toEqual({ loginStatus: RgLoginStatus.LoginUnknown, rgList: [] });
    });

    test('prefers logged in state', () => {
      let state = consolidateRgLoginState([
        { loginStatus: RgLoginStatus.LoginUnknown, rgList: [] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: [] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: [] },
        { loginStatus: RgLoginStatus.LoggedOut, rgList: [] },
      ]);

      expect(state).toEqual({ loginStatus: RgLoginStatus.LoggedIn, rgList: [] });

      state = consolidateRgLoginState([
        { loginStatus: RgLoginStatus.LoggedOut, rgList: [] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: [] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: [] },
      ]);

      expect(state).toEqual({ loginStatus: RgLoginStatus.LoggedIn, rgList: [] });
    });

    test('merges rgList of logged in states', () => {
      let state = consolidateRgLoginState([
        { loginStatus: RgLoginStatus.LoginUnknown, rgList: ['4001'] },
        { loginStatus: RgLoginStatus.LoggedOut, rgList: ['4002'] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: ['4003'] },
        { loginStatus: RgLoginStatus.LoginUnknown, rgList: ['4004'] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: ['4005'] },
        { loginStatus: RgLoginStatus.LoggedOut, rgList: ['4006'] },
      ]);

      expect(state).toEqual({ loginStatus: RgLoginStatus.LoggedIn, rgList: ['4003', '4005'] });

      state = consolidateRgLoginState([
        { loginStatus: RgLoginStatus.LoginUnknown, rgList: ['4010', '4011'] },
        { loginStatus: RgLoginStatus.LoggedOut, rgList: ['4040', '4021'] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: ['4001', '4002'] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: ['4002', '4003'] },
        { loginStatus: RgLoginStatus.LoggedIn, rgList: ['4001', '4002', '4004'] },
      ]);

      expect(state).toEqual({ loginStatus: RgLoginStatus.LoggedIn, rgList: ['4001', '4002', '4003', '4004'] });
    });
  });

  describe('ringgroup Op Status consolidation', () => {
    test('default status is Error', () => {
      const statusArr: RgOpStatus[] = [];
      const status = consolidateRgLoginOpStatus(statusArr);

      expect(status).toEqual(RgOpStatus.Error);
    });
    test('Ok status is preferred', () => {
      const statusArr: RgOpStatus[] = [
        RgOpStatus.AgentBusy,
        RgOpStatus.DeviceBusy,
        RgOpStatus.Error,
        RgOpStatus.NotExist,
        RgOpStatus.Ok,
      ];
      const status = consolidateRgLoginOpStatus(statusArr);

      expect(status).toEqual(RgOpStatus.Ok);
    });

    test('Error status is least preferred', () => {
      const statusArr: RgOpStatus[] = [
        RgOpStatus.Error,
        RgOpStatus.AgentBusy,
        RgOpStatus.DeviceBusy,
        RgOpStatus.Error,
        RgOpStatus.NotExist,
        RgOpStatus.Error,
      ];
      const status = consolidateRgLoginOpStatus(statusArr);

      expect(status).toEqual(RgOpStatus.AgentBusy);
    });
  });
});
