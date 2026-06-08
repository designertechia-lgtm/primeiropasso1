-- Agenda o cron do pós-atendimento (tick de 10min, espelho do appointment-reminders)
select cron.schedule('satisfaction-surveys', '*/10 * * * *', $$select public.process_satisfaction_surveys();$$);
