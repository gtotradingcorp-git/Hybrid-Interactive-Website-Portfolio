import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contactRouter from "./contact";
import chatRouter from "./chat";
import adminRouter from "./admin";
import matchRouter from "./match";
import demoEventsRouter from "./demoEvents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contactRouter);
router.use(chatRouter);
router.use(adminRouter);
router.use(matchRouter);
router.use(demoEventsRouter);

export default router;
