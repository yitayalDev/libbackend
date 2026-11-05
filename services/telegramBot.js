const TelegramBot = require('node-telegram-bot-api');
const Fault = require('../models/Fault');
const Lab = require('../models/Lab');
const User = require('../models/User');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Email transporter configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: (process.env.SMTP_PASS || '').replace(/\s+/g, '')
    }
});

let bot = null;
let botUserId = null;
const conversations = new Map();

// Main menu buttons
const mainMenuButtons = [
  { id: 'fault', label: '🔧 Report Fault' },
  { id: 'email', label: '📧 Email Support' },
  { id: 'map', label: '🗺️ View Map' },
  { id: 'help', label: '❓ Get Help' },
  { id: 'info', label: 'ℹ️ System Info' }
];

// Category buttons (for fault report)
const categories = [
  { id: 'hardware', label: '🔧 Hardware Issue' },
  { id: 'software', label: '💻 Software Issue' },
  { id: 'network', label: '🌐 Network Issue' },
  { id: 'peripheral', label: '🖱️ Peripheral Issue' },
  { id: 'other', label: '📋 Others' }
];

// Severity options
const severities = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' }
];

// Helper: create inline keyboard
function createInlineKeyboard(buttons, columns = 1, prefix = '') {
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += columns) {
    const row = buttons.slice(i, i + columns).map(btn => ({
      text: btn.label,
      callback_data: `${prefix}${btn.id}`
    }));
    keyboard.push(row);
  }
  return keyboard;
}

// Helper: generate Google Maps URL from lab location
function generateMapUrl(lab) {
  const location = lab.location;
  if (!location || !location.building) {
    // Fallback to search by lab name if no location data
    const searchQuery = encodeURIComponent(`${lab.name} ${lab.campus || ''}`);
    return `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
  }
  
  // Build location string
  const locationParts = [];
  if (location.building) locationParts.push(location.building);
  if (location.floor) locationParts.push(`Floor ${location.floor}`);
  if (location.roomNumber) locationParts.push(`Room ${location.roomNumber}`);
  
  const locationStr = locationParts.join(', ');
  const searchQuery = encodeURIComponent(`${locationStr} ${lab.campus || ''}`);
  
  return `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
}

// Send email function
async function sendEmail(to, subject, body) {
  try {
    const mailOptions = {
      from: process.env.SMTP_USER || 'noreply@clm.edu',
      to: to,
      subject: subject,
      text: body
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('[Bot] Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('[Bot] Email error:', error.message);
    return false;
  }
}

// Ensure a dedicated bot user exists in the system
async function ensureBotUser() {
  try {
    const existingBotUser = await User.findOne({ username: 'telegram_bot' });
    if (existingBotUser) {
      botUserId = existingBotUser._id;
      console.log('[Bot] Bot user found:', existingBotUser.username, 'ID:', botUserId);
      return;
    }

    const botUser = await User.create({
      username: 'telegram_bot',
      email: 'telegram_bot@clm.edu',
      password: 'TelegramBot123!',
      firstName: 'Telegram',
      lastName: 'Bot',
      name: 'Telegram Bot',
      role: 'student',
      isActive: true,
      approvalStatus: 'approved'
    });
    botUserId = botUser._id;
    console.log('[Bot] Created bot user. ID:', botUserId);
  } catch (error) {
    console.error('[Bot] Error ensuring bot user:', error);
    throw error;
  }
}

// Submit fault to database
async function submitFault(chatId, conv) {
  try {
    console.log('[Bot] submitFault conv:', {
      labId: conv.labId,
      labIdType: typeof conv.labId,
      title: conv.title,
      category: conv.category,
      severity: conv.severity
    });

    if (!conv.labId || !conv.title || !conv.description || !conv.category || !conv.severity) {
      throw new Error('Missing required fields');
    }

    // Ensure labId is an ObjectId
    let labObjectId = conv.labId;
    if (typeof conv.labId === 'string') {
      labObjectId = mongoose.Types.ObjectId(conv.labId);
    }

    const faultData = {
      reportedBy: botUserId,
      lab: labObjectId,
      workstation: conv.workstation || undefined,
      category: conv.category,
      severity: conv.severity,
      title: conv.title,
      description: conv.description,
      submittedTo: 'technician'
    };

    const fault = new Fault(faultData);
    await fault.save();
    console.log('[Bot] Fault saved to DB:', {
      _id: fault._id,
      title: fault.title,
      category: fault.category,
      lab: fault.lab,
      reportedBy: fault.reportedBy,
      status: fault.status
    });

    // Verify it's actually in DB
    const check = await Fault.findById(fault._id);
    if (!check) {
      throw new Error('Fault not found after save - possible DB issue');
    }
    console.log('[Bot] Verified fault exists in DB:', check._id);

    await fault.populate('reportedBy lab');
    console.log('[Bot] Fault populated:', {
      reportedBy: fault.reportedBy?.name,
      lab: fault.lab?.name
    });

    // Cleanup conversation
    conversations.delete(chatId);

    const successMsg = `✅ *Fault Reported Successfully!*\n\n` +
      `*Fault ID:* ${fault._id}\n` +
      `*Title:* ${fault.title}\n` +
      `*Status:* ${fault.status}\n\n` +
      `Our technical team will address your issue shortly.`;

    await bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('[Bot] Error submitting fault:', error);
    await bot.sendMessage(chatId, '❌ Failed to submit fault report. Please try again later.');
    conversations.delete(chatId);
  }
}

// Setup all bot event handlers
function setupHandlers(bot) {
  // /start command handler
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'there';
    const welcomeMessage = `👋 Hello ${userName}! Welcome to the CLM System Bot. How can I help you today? Please select an option:`;

    conversations.delete(chatId);

    const keyboard = {
      inline_keyboard: createInlineKeyboard(mainMenuButtons, 2)
    };

    bot.sendMessage(chatId, welcomeMessage, { reply_markup: keyboard, parse_mode: 'Markdown' })
      .then(() => {
        conversations.set(chatId, { step: 'MAIN_MENU_DISPLAYED' }); // Set a generic state after displaying main menu
      })
      .catch(err => console.error('[Bot] Error sending start message:', err));
  });

  // /cancel command handler
  bot.onText(/\/cancel/, (msg) => {
    const chatId = msg.chat.id;
    if (conversations.has(chatId)) {
      conversations.delete(chatId);
      bot.sendMessage(chatId, '✅ Fault report cancelled. Send /start to begin again.');
    } else {
      bot.sendMessage(chatId, 'No active report. Send /start to begin.');
    }
  });

// Callback query handler
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    let conv = conversations.get(chatId);

    await bot.answerCallbackQuery(query.id);

    // If no active conversation, or if the step is just 'MAIN_MENU_DISPLAYED',
    // we should handle the main menu button clicks.
    if (!conv || conv.step === 'MAIN_MENU_DISPLAYED') {
      conv = {}; // Start a new conversation state for this interaction
      conversations.set(chatId, conv); // Store the new conversation state
    } else if (!conv.step) {
        // If conv exists but step is not set, it's an unexpected state, reset.
        await bot.sendMessage(chatId, 'Session expired or invalid state. Send /start to begin again.');
        conversations.delete(chatId);
        return;
    }

    console.log(`[Bot] Callback query: chatId=${chatId}, data=${data}, currentStep=${conv.step}`);

    // Handle main menu button clicks
    if (data === 'fault') {
      conv.step = 'AWAITING_CATEGORY';
      conversations.set(chatId, conv); // Update conversation state
      const faultCategoriesKeyboard = {
        inline_keyboard: createInlineKeyboard(categories, 2, 'cat_')
      };
      await bot.sendMessage(chatId, '🔧 *Report a Fault*\n\nPlease select a category for the issue:', { parse_mode: 'Markdown', reply_markup: faultCategoriesKeyboard });
      return;
    }

    if (data === 'email') {
      conv.step = 'AWAITING_EMAIL';
      conversations.set(chatId, conv); // Update conversation state
      await bot.sendMessage(chatId, '📧 *Email Support*\n\nPlease enter your *email address*:', { parse_mode: 'Markdown' });
      return;
    }
    
    if (data === 'map') {
      conv.step = 'AWAITING_MAP_LAB';
      conversations.set(chatId, conv); // Update conversation state
      await bot.sendMessage(chatId, '🗺️ *View Lab Map*\n\nPlease enter the *lab name* or *lab code* (e.g., LAB-A101, IT Lab):', { parse_mode: 'Markdown' });
      return;
    }

    if (data === 'help') {
      const helpMessage = `❓ *Get Help*\n\n` +
        `Welcome to the CLM System Bot help section!\n\n` +
        `*Available Commands:*\n` +
        `• /start - Start the bot and show main menu\n` +
        `• /cancel - Cancel current operation\n\n` +
        `*How to Use the Bot:*\n` +
        `1. Click "Report Fault" to report a technical issue\n` +
        `2. Click "Email Support" to contact support via email\n` +
        `3. Click "View Map" to find lab locations\n` +
        `4. Click "System Info" to see system information\n\n` +
        `For immediate assistance, contact your system administrator.`;
      await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
      conversations.delete(chatId); // End conversation after providing help
      return;
    }

    if (data === 'info') {
      const infoMessage = `ℹ️ *System Information*\n\n` +
        `*CLM System Bot*\n` +
        `Version: 1.0.0\n` +
        `Last Updated: ${new Date().toLocaleDateString()}\n\n` +
        `*Features:*\n` +
        `• Report technical faults in computer labs\n` +
        `• Contact support via email\n` +
        `• View lab locations on map\n` +
        `• Get help and assistance\n\n` +
        `*Supported Actions:*\n` +
        `• Fault Reporting (Hardware, Software, Network, Peripheral)\n` +
        `• Lab Location Lookup\n` +
        `• Email Support\n\n` +
        `For more information, visit the CLM System portal.`;
      await bot.sendMessage(chatId, infoMessage, { parse_mode: 'Markdown' });
      conversations.delete(chatId); // End conversation after providing info
      return;
    }

    // Category selection (for fault report)
    if (data.startsWith('cat_')) {
      const category = data.replace('cat_', '');
      conv.category = category;
      conv.step = 'AWAITING_LAB';
      conversations.set(chatId, conv); // Update conversation state

      const categoryNames = {
        hardware: 'Hardware Issue',
        software: 'Software Issue',
        network: 'Network Issue',
        peripheral: 'Peripheral Issue',
        other: 'Other Issue'
      };

      await bot.sendMessage(chatId, `You selected: *${categoryNames[category]}*`, { parse_mode: 'Markdown' });
      await bot.sendMessage(chatId, '📍 Please enter the *lab name* or *lab code* (e.g., LAB-A101, IT Lab):', { parse_mode: 'Markdown' });
      return;
    }

    // Severity selection
    if (data.startsWith('sev_')) {
      const severity = data.replace('sev_', '');
      conv.severity = severity;
      conv.step = 'AWAITING_CONFIRM';
      conversations.set(chatId, conv); // Update conversation state

      const summary = `📋 *Fault Report Summary*\n\n` +
        `*Category:* ${conv.category}\n` +
        `*Lab:* ${conv.labName}\n` +
        `*Workstation:* ${conv.workstation || 'N/A'}\n` +
        `*Title:* ${conv.title}\n` +
        `*Description:* ${conv.description}\n` +
        `*Severity:* ${severity.charAt(0).toUpperCase() + severity.slice(1)}\n\n` +
        `Do you want to submit this report?`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ Yes, Submit', callback_data: 'confirm_yes' }],
          [{ text: '❌ No, Cancel', callback_data: 'confirm_no' }]
        ]
      };

      await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown', reply_markup: keyboard });
      return;
    }

    // Confirmation
    if (data === 'confirm_yes') {
      await submitFault(chatId, conv);
      return;
    }

    if (data === 'confirm_no') {
      conversations.delete(chatId);
      await bot.sendMessage(chatId, '🚫 Fault report cancelled. Send /start to begin again.');
      return;
    }

    // If a callback query is received but not handled by specific steps,
    // it might be an old button or unexpected interaction.
    if (conv.step !== 'MAIN_MENU_DISPLAYED') {
      await bot.sendMessage(chatId, 'Unexpected selection. Send /cancel to start over or /start for main menu.');
      conversations.delete(chatId);
    }
  });

  // Text message handler
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.trim() : '';

    // Ignore commands in text handler, they are handled by onText
    if (text.startsWith('/')) {
        return;
    }

    if (!text || !conversations.has(chatId)) {
      if (text && !conversations.has(chatId)) {
        console.log(`[Bot] Received message from ${chatId} but no active conversation: "${text.substring(0, 50)}"`);
      }
      return;
    }

    const conv = conversations.get(chatId);
    console.log(`[Bot] Chat ${chatId} step=${conv.step}, text="${text.substring(0, 50)}"`);

    try {
      switch (conv.step) {
        case 'AWAITING_LAB':
          console.log(`[Bot] Chat ${chatId} searching for lab: "${text}"`);
          const labRegex = new RegExp(text, 'i');
          const labs = await Lab.find({
            $or: [{ name: labRegex }, { code: labRegex }],
            isActive: true
          }).limit(5);

          console.log(`[Bot] Found ${labs.length} labs matching "${text}"`, labs.map(l => ({ id: l._id, name: l.name, code: l.code })));

          if (labs.length === 0) {
            await bot.sendMessage(chatId, '❌ No lab found matching that name/code. Please try again.\nEnter lab name or code:');
            return;
          }

          if (labs.length === 1) {
            conv.labId = labs[0]._id;
            conv.labName = labs[0].name;
            conv.step = 'AWAITING_WORKSTATION';
            conversations.set(chatId, conv); // Update conversation state
            await bot.sendMessage(chatId, `✅ Lab found: *${labs[0].name}* (${labs[0].code})`, { parse_mode: 'Markdown' });
            await bot.sendMessage(chatId, '🖥️ Please enter the *Workstation ID* (e.g., PC-05), or send /skip to skip.', { parse_mode: 'Markdown' });
          } else {
            conv.step = 'AWAITING_LAB_CHOICE';
            conv.matchingLabs = labs;
            const labList = labs.map((l, i) => `${i + 1}. ${l.name} (${l.code})`).join('\n');
            await bot.sendMessage(chatId, `🔍 Multiple labs found:\n\n${labList}\n\nPlease reply with the number of the correct lab (1-${labs.length}):`);
            conversations.set(chatId, conv); // Update conversation state
          }
          break;

        case 'AWAITING_LAB_CHOICE':
          const choice = parseInt(text, 10);
          if (isNaN(choice) || choice < 1 || choice > conv.matchingLabs.length) {
            await bot.sendMessage(chatId, 'Invalid choice. Please enter a valid number from the list.');
            return;
          }
          const selectedLab = conv.matchingLabs[choice - 1];
          console.log(`[Bot] Chat ${chatId} selected lab #${choice}: ${selectedLab.name} (${selectedLab.code})`);
          conv.labId = selectedLab._id;
          conv.labName = selectedLab.name;
          conv.step = 'AWAITING_WORKSTATION';
          conversations.set(chatId, conv); // Update conversation state
          await bot.sendMessage(chatId, `✅ Lab selected: *${selectedLab.name}* (${selectedLab.code})`, { parse_mode: 'Markdown' });
          await bot.sendMessage(chatId, '🖥️ Please enter the *Workstation ID* (e.g., PC-05), or send /skip to skip.', { parse_mode: 'Markdown' });
          break;

        case 'AWAITING_WORKSTATION':
          if (text.toLowerCase() === '/skip') {
            conv.workstation = '';
          } else {
            conv.workstation = text;
          }
          conv.step = 'AWAITING_TITLE';
          conversations.set(chatId, conv); // Update conversation state
          await bot.sendMessage(chatId, '📝 Please enter a *brief title* for the issue (e.g., "Computer #5 not booting"):', { parse_mode: 'Markdown' });
          break;

        case 'AWAITING_TITLE':
          if (text.length < 5) {
            await bot.sendMessage(chatId, 'Title too short. Please provide at least 5 characters.');
            return;
          }
          conv.title = text;
          conv.step = 'AWAITING_DESCRIPTION';
          conversations.set(chatId, conv); // Update conversation state
          await bot.sendMessage(chatId, '📄 Please provide a *detailed description* of the issue:');
          break;

case 'AWAITING_DESCRIPTION':
          if (text.length < 10) {
            await bot.sendMessage(chatId, 'Description too short. Please provide more details (at least 10 characters).');
            return;
          }
          conv.description = text;
          conv.step = 'AWAITING_SEVERITY';
          conversations.set(chatId, conv); // Update conversation state
          const severityKeyboard = {
            inline_keyboard: createInlineKeyboard(severities, 2, 'sev_')
          };
          await bot.sendMessage(chatId, '🔔 Select the *severity level* of this issue:', {
            parse_mode: 'Markdown',
            reply_markup: severityKeyboard
          });
          break;

        // Email support conversation flow
        case 'AWAITING_EMAIL':
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(text)) {
            await bot.sendMessage(chatId, '❌ Invalid email format. Please enter a valid email address:');
            return;
          }
          conv.userEmail = text;
          conv.step = 'AWAITING_EMAIL_SUBJECT';
          conversations.set(chatId, conv); // Update conversation state
          await bot.sendMessage(chatId, '✅ Email address saved!\n\n📝 Please enter the *subject* of your message:', { parse_mode: 'Markdown' });
          break;

        case 'AWAITING_EMAIL_SUBJECT':
          if (text.length < 3) {
            await bot.sendMessage(chatId, '❌ Subject too short. Please provide at least 3 characters.');
            return;
          }
          conv.emailSubject = text;
          conv.step = 'AWAITING_EMAIL_MESSAGE';
          conversations.set(chatId, conv); // Update conversation state
          await bot.sendMessage(chatId, '📄 Please enter the *message* you want to send:', { parse_mode: 'Markdown' });
          break;

        case 'AWAITING_EMAIL_MESSAGE':
          if (text.length < 10) {
            await bot.sendMessage(chatId, '❌ Message too short. Please provide at least 10 characters.');
            return;
          }
          conv.emailMessage = text;
          
          // Send the email
          const adminEmail = process.env.SMTP_USER || 'admin@clm.edu';
          const emailBody = `Message from: ${conv.userEmail}\n\nSubject: ${conv.emailSubject}\n\nMessage:\n${conv.emailMessage}`;
          const success = await sendEmail(adminEmail, `[Telegram] ${conv.emailSubject}`, emailBody);
          
          if (success) {
            await bot.sendMessage(chatId, '✅ *Email sent successfully!*\n\nOur admin team will respond to your message shortly.', { parse_mode: 'Markdown' });
          } else {
            await bot.sendMessage(chatId, '❌ Failed to send email. Please try again later.');
          }
          conversations.delete(chatId);
          break;

        // Map viewing
        case 'AWAITING_MAP_LAB':
          const mapLabRegex = new RegExp(text, 'i');
          const mapLabs = await Lab.find({
            $or: [{ name: mapLabRegex }, { code: mapLabRegex }],
            isActive: true
          }).limit(5);

          if (mapLabs.length === 0) {
            await bot.sendMessage(chatId, '❌ No lab found matching that name/code. Please try again.\nEnter lab name or code:');
            return;
          }

          if (mapLabs.length === 1) {
            const lab = mapLabs[0];
            const mapUrl = generateMapUrl(lab);
            await bot.sendMessage(chatId, `📍 *Lab Location*\n\n*${lab.name}* (${lab.code})\n\n🏢 Building: ${lab.location?.building || 'N/A'}\n🏠 Floor: ${lab.location?.floor || 'N/A'}\n🚪 Room: ${lab.location?.roomNumber || 'N/A'}\n\n🗺️ [View on Google Maps](${mapUrl})`, { 
              parse_mode: 'Markdown',
              disable_web_page_preview: false
            });
            conversations.delete(chatId);
          } else {
            conv.step = 'AWAITING_MAP_LAB_CHOICE';
            conv.matchingLabs = mapLabs;
            conversations.set(chatId, conv); // Update conversation state
            const labList = mapLabs.map((l, i) => `${i + 1}. ${l.name} (${l.code})`).join('\n');
            await bot.sendMessage(chatId, `🔍 Multiple labs found:\n\n${labList}\n\nPlease reply with the number of the correct lab (1-${mapLabs.length}):`);
          }
          break;

        case 'AWAITING_MAP_LAB_CHOICE':
          const mapChoice = parseInt(text, 10);
          if (isNaN(mapChoice) || mapChoice < 1 || mapChoice > conv.matchingLabs.length) {
            await bot.sendMessage(chatId, '❌ Invalid choice. Please enter a valid number from the list.');
            return;
          }
          const selectedMapLab = conv.matchingLabs[mapChoice - 1];
          const mapUrlSelected = generateMapUrl(selectedMapLab);
          await bot.sendMessage(chatId, `📍 *Lab Location*\n\n*${selectedMapLab.name}* (${selectedMapLab.code})\n\n🏢 Building: ${selectedMapLab.location?.building || 'N/A'}\n🏠 Floor: ${selectedMapLab.location?.floor || 'N/A'}\n🚪 Room: ${selectedMapLab.location?.roomNumber || 'N/A'}\n\n🗺️ [View on Google Maps](${mapUrlSelected})`, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: false
          });
          conversations.delete(chatId);
          break;

        default:
          await bot.sendMessage(chatId, 'Unexpected input. Send /cancel to start over.');
      }
    } catch (err) {
      console.error('[Bot] Error processing message:', err);
      await bot.sendMessage(chatId, 'An error occurred. Please try again or send /start to restart.');
    }
  });

  bot.on('polling_error', (error) => {
    console.error('[Bot] Polling error:', error);
  });
}

// Export initialize function
module.exports.initializeBot = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Bot] TELEGRAM_BOT_TOKEN not set in .env. Telegram bot will not start.');
    return;
  }

  try {
    await ensureBotUser();
    bot = new TelegramBot(token, { polling: true });
    setupHandlers(bot);
    console.log('🤖 Telegram Bot started with category buttons!');
    console.log('Bot user ID:', botUserId);
  } catch (err) {
    console.error('[Bot] Failed to initialize:', err);
  }
};
