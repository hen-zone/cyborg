import request from "request-promise";
import {sendNotification} from './iftttNotificationsApi'

const BEEMINDER_AUTH_TOKEN = 'jUyVNQvxwe9gxzfapmu1';
const BEEMINDER_USER_NAME = 'hypertexture';

export async function incrementBeeminderGoal(goalId) {
    const result = await request({
        method: 'POST',
        uri: `https://www.beeminder.com/api/v1/users/${BEEMINDER_USER_NAME}/goals/${goalId}/datapoints.json?value=1&auth_token=${BEEMINDER_AUTH_TOKEN}`
    });

    await sendNotification(`🐝 Updated the ${goalId} goal.`);

    return result;
}