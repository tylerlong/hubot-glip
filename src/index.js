import fs from 'fs'
import RingCentral from 'ringcentral-js-concise'
import PubNub from 'ringcentral-js-concise/src/pubnub.es5.js'

let hubot = null
try {
  hubot = require('hubot')
} catch (_) {
  const prequire = require('parent-require')
  hubot = prequire('hubot')
}
const { Adapter, TextMessage, User } = hubot

class GlipAdapter extends Adapter {
  constructor (robot) {
    super(robot)
    this.rc = new RingCentral(
      process.env.RINGCENTRAL_CLIENT_ID,
      process.env.RINGCENTRAL_CLIENT_SECRET,
      process.env.RINGCENTRAL_SERVER || RingCentral.PRODUCTION_SERVER
    )

    if (fs.existsSync('./token.json')) {
      const data = fs.readFileSync('./token.json', 'utf8')
      this.rc.token(JSON.parse(data))
      this.robot.logger.info('Token restored from file')
      this.subscribe()
    } else {
      this.robot.logger.error('No saved token detected. You need to add the bot to Glip first.')
    }

    this.robot.router.post('/oauth', (req, res) => {
      this.rc.token(req.body)
      fs.writeFileSync('./token.json', JSON.stringify(this.rc.token(), null, 2))
      this.subscribe()
      res.send('')
    })

    this.robot.router.get('/oauth', async (req, res) => {
      this.robot.logger.info(req.query.code)
      await this.rc.authorize({
        code: req.query.code,
        redirectUri: `${process.env.RINGCENTRAL_BOT_SERVER}/oauth`
      })
      fs.writeFileSync('./token.json', JSON.stringify(this.rc.token(), null, 2))
      this.subscribe()
      res.send('')
    })
  }

  subscribe () {
    const pubnub = new PubNub(this.rc, ['/restapi/v1.0/glip/posts'], message => {
      this.robot.logger.info(JSON.stringify(message, null, 2))
      const post = message.body
      if (post.eventType === 'PostAdded' && post.text && post.text !== '') {
        const user = new User(post.creatorId, {
          room: post.groupId,
          reply_to: post.groupId,
          name: `User ${post.creatorId} from Group ${post.groupId}`
        })
        const hubotMessage = new TextMessage(user, post.text, 'MSG-' + post.id)
        this.robot.receive(hubotMessage)
      }
    })
    pubnub.subscribe()
    this.robot.logger.info('Subscription created')
  }

  send (envelope, ...strings) {
    const textToSend = strings[0]
    const attachmentsToSend = strings[1]
    var dataToSend = {
      groupId: envelope.user.reply_to
    }
    if(textToSend !== undefined){
      dataToSend.text = textToSend
    }
    if(attachmentsToSend !== undefined){
      dataToSend.attachments = attachmentsToSend
    }
    this.robot.logger.info('send ' + JSON.stringify(envelope, null, 4) + '\n\n object:' + JSON.stringify(dataToSend, null, 4))
    this.rc.post('/restapi/v1.0/glip/posts', dataToSend)
  }

  reply (envelope, ...strings) {
    const string = strings[0]
    this.robot.logger.info('reply ' + JSON.stringify(envelope, null, 4) + '\n\n' + string)
    this.rc.post('/restapi/v1.0/glip/posts', {
      groupId: envelope.user.reply_to, text: string
    })
  }

  run () {
    this.robot.logger.info('Run')
    this.emit('connected')
  }
}

exports.use = function (robot) {
  return new GlipAdapter(robot)
}
