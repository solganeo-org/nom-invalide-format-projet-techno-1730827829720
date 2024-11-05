const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./notificationHandlers');
const { logEvent } = require('../utils/logger');
const { triggerCICD } = require('../utils/cicd');
const config = require('../config/config');

const logEventToFile = (eventType, data) => {
    const logFilePath = path.join(__dirname, '..', 'public', 'logs.json');

    // Charger les logs existants ou initialiser une liste vide
    let logs = [];
    if (fs.existsSync(logFilePath)) {
        logs = JSON.parse(fs.readFileSync(logFilePath));
    }

    // Ajouter un nouveau log
    logs.push({
        timestamp: new Date().toISOString(),
        event: eventType,
        data: data
    });

    // Sauvegarder les logs
    fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
};

module.exports.handlePush = async (payload) => {
    try {
        console.log('Received push event payload:', JSON.stringify(payload, null, 2));

        if (!payload || !payload.ref) {
            console.error('Error: payload or payload.ref is undefined.');
            console.log('Payload content:', JSON.stringify(payload, null, 2));
            throw new Error('Invalid payload: ref is undefined.');
        }

        const branch = payload.ref.replace('refs/heads/', '');
        const commits = payload.commits;
        const repository = payload.repository.full_name;

        console.log(`Handling push event for branch: ${branch} in repository: ${repository}`);

        await logEvent('push', payload);
        await logEventToFile('push', { branch, repository, commits });

        console.log('Event logged successfully for push.');

        const sensitiveFiles = ['.env', 'config.json', 'secrets.yaml', 'credentials.json'];
        const sensitiveChanges = commits.some(commit =>
            commit.added.concat(commit.modified).some(file => sensitiveFiles.includes(file))
        );

        if (sensitiveChanges) {
            await notifySlack(`🚨 Sensitive changes detected on branch ${branch} in ${repository} by ${payload.pusher.name}`);
            console.log('Slack notification sent for sensitive changes.');
        }

        await triggerCICD({
            repository,
            branch,
            commit: payload.after,
            author: payload.pusher.name
        });
        console.log('CI/CD triggered successfully.');

    } catch (error) {
        console.error('Error handling push event:', error);
        throw error;
    }
};

module.exports.handlePullRequest = async (payload) => {
    try {
        console.log('Received pull request event payload:', JSON.stringify(payload, null, 2));

        if (!payload || !payload.pull_request) {
            console.error('Error: payload or payload.pull_request is undefined.');
            throw new Error('Invalid payload: pull_request is undefined.');
        }

        const { action, pull_request, repository } = payload;
        const prDetails = {
            number: pull_request.number,
            title: pull_request.title,
            base: pull_request.base.ref,
            head: pull_request.head.ref,
            author: pull_request.user.login,
            repository: repository.full_name
        };

        console.log(`Handling pull request event: ${action} for PR #${prDetails.number} in repository: ${prDetails.repository}`);

        await logEvent('pull_request', payload);
        await logEventToFile('pull_request', prDetails);

        console.log('Event logged successfully for pull request.');

        if (['opened', 'reopened'].includes(action)) {
            await notifySlack(`📝 New PR #${prDetails.number}: ${prDetails.title} in ${prDetails.repository}`);
            console.log('Slack notification sent for new/reopened PR.');
        } else if (action === 'closed' && pull_request.merged) {
            await notifySlack(`✅ PR #${prDetails.number} merged in ${prDetails.repository}`);
            console.log('Slack notification sent for merged PR.');
        } else {
            console.log(`Unhandled pull request action: ${action}`);
        }

    } catch (error) {
        console.error('Error handling pull request event:', error);
        throw error;
    }
};

module.exports.handleIssueComment = async (payload) => {
    try {
        console.log('Received issue comment event payload:', JSON.stringify(payload, null, 2));

        if (!payload || !payload.comment || !payload.issue) {
            console.error('Error: payload, payload.comment, or payload.issue is undefined.');
            throw new Error('Invalid payload: comment or issue is undefined.');
        }

        const { action, comment, issue, repository } = payload;

        console.log(`Handling issue comment event: ${action} on issue #${issue.number} in repository: ${repository.full_name}`);

        if (action === 'created') {
            await logEvent('issue_comment', payload);
            await logEventToFile('issue_comment', { issue: issue.number, repository: repository.full_name, comment: comment.body });
            
            console.log('Event logged successfully for issue comment.');
            
            await notifySlack(`💬 New comment on issue #${issue.number} in ${repository.full_name}: "${comment.body}" by ${comment.user.login}`);
            console.log('Slack notification sent for new issue comment.');
        }

    } catch (error) {
        console.error('Error handling issue comment event:', error);
        throw error;
    }
};

module.exports.handleSecurityAdvisory = async (payload) => {
    try {
        console.log('Received security advisory event payload:', JSON.stringify(payload, null, 2));

        if (!payload || !payload.security_advisory) {
            console.error('Error: payload or payload.security_advisory is undefined.');
            throw new Error('Invalid payload: security_advisory is undefined.');
        }

        const { action, security_advisory, repository } = payload;

        console.log(`Handling security advisory event: ${action} in repository: ${repository.full_name}`);

        if (action === 'published') {
            await logEvent('security_advisory', payload);
            await logEventToFile('security_advisory', { summary: security_advisory.summary, repository: repository.full_name });

            console.log('Event logged successfully for security advisory.');
            
            await notifySlack(`🚨 Security advisory published in ${repository.full_name}: ${security_advisory.summary}`);
            console.log('Slack notification sent for published security advisory.');
        }

    } catch (error) {
        console.error('Error handling security advisory event:', error);
        throw error;
    }
};

module.exports.handleRepositoryVulnerabilityAlert = async (payload) => {
    try {
        console.log('Received repository vulnerability alert event payload:', JSON.stringify(payload, null, 2));

        if (!payload || !payload.alert) {
            console.error('Error: payload or payload.alert is undefined.');
            throw new Error('Invalid payload: alert is undefined.');
        }

        const { action, alert, repository } = payload;

        console.log(`Handling repository vulnerability alert: ${action} in repository: ${repository.full_name}`);

        if (action === 'created') {
            await logEvent('repository_vulnerability_alert', payload);
            await logEventToFile('repository_vulnerability_alert', { package: alert.package_name, repository: repository.full_name });

            console.log('Event logged successfully for vulnerability alert.');
            
            await notifySlack(`🔒 New vulnerability alert in ${repository.full_name} for ${alert.package_name}`);
            console.log('Slack notification sent for vulnerability alert.');
        }

    } catch (error) {
        console.error('Error handling repository vulnerability alert event:', error);
        throw error;
    }
};

module.exports.handleRepositoryRename = async (payload) => {
    try {
        console.log('Received repository rename event payload:', JSON.stringify(payload, null, 2));

        const oldName = payload.changes.repository.name.from;
        const newName = payload.repository.name;
        const fullName = payload.repository.full_name;

        console.log(`Repository renamed from ${oldName} to ${newName} (${fullName})`);

        await logEvent('repository_rename', payload);
        await logEventToFile('repository_rename', { oldName, newName, fullName });

        console.log('Event logged successfully for repository rename.');

        await notifySlack(`🔄 Repository renamed from ${oldName} to ${newName} (${fullName})`);
        console.log('Slack notification sent for repository rename.');

    } catch (error) {
        console.error('Error handling repository rename event:', error);
        throw error;
    }
};

module.exports.handleDeploymentStatus = async (payload) => {
    try {
        console.log('Received deployment status event payload:', JSON.stringify(payload, null, 2));

        const deploymentStatus = payload.deployment_status.state;
        const repository = payload.repository.full_name;
        const environment = payload.deployment.environment;

        console.log(`Deployment status for ${repository} in environment ${environment}: ${deploymentStatus}`);

        await logEvent('deployment_status', payload);
        await logEventToFile('deployment_status', { repository, environment, deploymentStatus });

        console.log('Event logged successfully for deployment status.');

        await notifySlack(`🚀 Deployment status for ${repository} in ${environment}: ${deploymentStatus}`);
        console.log('Slack notification sent for deployment status.');

    } catch (error) {
        console.error('Error handling deployment status event:', error);
        throw error;
    }
};
