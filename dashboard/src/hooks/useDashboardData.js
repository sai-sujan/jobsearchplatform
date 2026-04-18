import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';

/**
 * Fetch all matched jobs for the current user.
 */
export const useJobs = (userId) => {
  return useQuery({
    queryKey: ['jobs', userId],
    queryFn: async () => {
      const response = await client.get('/jobs', { params: { user_id: userId } });
      return response.data;
    },
    enabled: !!userId,
  });
};

/**
 * Fetch all extracted notifications for the current user.
 */
export const useNotifications = (userId) => {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const response = await client.get('/notifications', { params: { user_id: userId } });
      return response.data;
    },
    refetchInterval: 30000, // Poll every 30s as a fallback for SSE in MVP
    enabled: !!userId,
  });
};

/**
 * Trigger AI Resume Tailoring for a specific job.
 */
export const useTailorResume = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ jobId, userId }) => {
      const response = await client.post(`/resumes/tailor`, {
        job_id: jobId,
        user_id: userId,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Optimistically invalidate jobs to show processing status if applicable
      queryClient.invalidateQueries({ queryKey: ['jobs', variables.userId] });
    },
  });
};
