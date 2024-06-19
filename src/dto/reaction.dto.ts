export class ReactionDTO {
  id: number;
  emoji: string;
  userId: number;
  messageId: number;

  constructor(reaction: any) {
    this.id = reaction.id;
    this.emoji = reaction.emoji;
    this.userId = reaction.user.id;
    this.messageId = reaction.message.id;
  }
}
