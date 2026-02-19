import api from './api';

export const agencyProfilesAPI = {
  createProfile: (data) => api.post('/agency/profiles', data),
  listMyProfiles: () => api.get('/agency/profiles'),
  updateProfile: (id, data) => api.patch(`/agency/profiles/${id}`, data),
  deleteProfile: (id) => api.delete(`/agency/profiles/${id}`),
};