#!/usr/bin/env python
from src.bot import FinanceBot

if __name__ == '__main__':
    bot = FinanceBot()
    print("Bot iniciado. Presiona Ctrl+C para detener.")
    bot.run()