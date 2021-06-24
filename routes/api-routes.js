module.exports = function (config) {
  var express = require("express");
  var apiRouter = express.Router();
  var _ = require("underscore");
  var ObjectId = require("mongoose").Types.ObjectId;
  var Currency = require("../models/currency");
  var Country = require("../models/country");
  var Invitee = require("../models/invitee");
  var Account = require("../models/account");
  var Contact = require("../models/contact");
  var UserSettings = require("../models/user-settings");
  var Feedback = require("../models/feedback");
  var Workitem = require("../models/workitem");
  var WorkitemInstance = require("../models/workitem-instance");
  var WorkitemPlan = require("../models/workitem-plan");
  var CashAtHomeInstance = require("../models/cash-at-home-instance");
  var CashAtHomePlan = require("../models/cash-at-home-plan");
  var GivenReceivedInstance = require("../models/given-received-instance");
  var Bank = require("../models/bank");
  var BankTransaction = require("../models/bank-transaction");
  var Investment = require("../models/investment");
  var InvestmentTransaction = require("../models/investment-transaction");
  var CreditCard = require("../models/credit-card");
  var CreditCardTransaction = require("../models/credit-card-transaction");
  var Loan = require("../models/loan");
  var LoanTransaction = require("../models/loan-transaction");
  var Tag = require("../models/tag");
  var jwt = require("jsonwebtoken");
  var randomstring = require("randomstring");

  var AWS = require("aws-sdk");
  AWS.config.update(process.env.AWS_CREDS || config.awsSettings.credentials);
  var s3Bucket = new AWS.S3({
    params: { Bucket: process.env.AWS_BUCKET || config.awsSettings.bucket },
  });

  apiRouter.get("/", function (req, res, next) {
    res.json({ message: "Welcome to Wallora api!" });
  });

  apiRouter
    .route("/feedbacks")
    .post(function (req, res) {
      var feedback = new Feedback();
      feedback.message = req.body.message;
      feedback.fullName = req.body.fullName;
      feedback.email = req.body.email;
      feedback.source = req.body.source;

      feedback.save(function (err) {
        if (err) {
          res.send(err);
          return;
        }

        res.json({ message: "Feedback submitted" });
      });
    })

    .get(function (req, res) {
      Feedback.find(function (err, feedbacks) {
        if (err) {
          res.send(err);
          return;
        }

        res.json(feedbacks);
      });
    });

  apiRouter.post("/authenticate", function (req, res) {
    Account.findOne(
      {
        email: req.body.email,
      },
      function (err, account) {
        if (err) {
          res.send(err);
          return;
        }

        if (!account) {
          res.json({
            success: false,
            message: "Authentication failed, User not found.",
          });
        } else if (account) {
          if (account.password != req.body.password) {
            res.send({
              success: false,
              message:
                "Authentication failed. User email and password does not match",
            });
            return;
          } else {
            var sanitizedAcc = {
              email: account.email,
              username: account.username,
              firstName: account.firstName,
              lastName: account.lastName,
            };
            var token = jwt.sign(
              sanitizedAcc,
              process.env.SECRET || config.secret,
              {
                expiresInMinutes: 1440, // expires in 24 hours
              }
            );

            res.json({
              success: true,
              message: "Welcome " + account.email,
              token: token,
            });
          }
        }
      }
    );
  });

  apiRouter.use(function (req, res, next) {
    var token = req.headers["authorization"]
      ? req.headers["authorization"].replace("Bearer ", "")
      : req.headers["x-access-token"]
      ? req.headers["x-access-token"]
      : undefined;

    if (token) {
      jwt.verify(
        token,
        process.env.SECRET || config.secret,
        function (err, decoded) {
          console.log("############", err, decoded);

          if (err) {
            return res.json({
              success: false,
              message: "Failed to authenticate token.",
            });
          } else {
            req.decoded = decoded;
            next();
          }
        }
      );
    } else {
      return res.status(403).send({
        success: false,
        message: "No token provided.",
      });
    }
  });

  function findItemsForThisAccount(req, res, cb) {
    var acc = req.decoded;
    Account.findOne({ username: acc.username }, function (err, account) {
      if (err) {
        res.send(err);
        return;
      }

      if (account != null) {
        cb(account);
      } else {
        res.status(404);
        res.send({ message: "User " + acc.username + " not found" });
        return;
      }
    });
  }

  apiRouter.route("/user-settings/password").post(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      var oldPassword = req.body.oldPassword;
      var newPassword = req.body.newPassword;

      if (account.password !== oldPassword) {
        res.json({ success: false, message: "Old password is incorrect" });
        return;
      }

      account.password = newPassword;
      account.save(function (err, account) {
        if (err) {
          console.log(err);
          res.status(500).json({ message: "Something has gone wrong!" });
          return;
        }

        res.json({
          success: true,
          message:
            "Password changed successfully. Please login using new password",
        });
      });
    });
  });

  apiRouter
    .route("/user-settings")
    .get(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (err, userSettings) {
            if (err) {
              res.send(err);
              return;
            }
            userSettings = userSettings.toJSON();
            userSettings.firstName = account.firstName;
            userSettings.lastName = account.lastName;
            res.json(userSettings);
          }
        );
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        account.firstName = req.body.firstName;
        account.lastName = req.body.lastName;
        account.save(function (err, account) {
          if (err) {
            console.log(err);
            res.status(500).json({ message: "Something has gone wrong!" });
            return;
          }

          UserSettings.findOne(
            { accountId: account.id },
            function (err, userSettings) {
              if (err || userSettings == null) {
                userSettings = new UserSettings();
              }

              userSettings.accountId = account.id;
              var reqBody = req.body;
              userSettings.currency = reqBody.currency || "USD";
              userSettings.monthlyIncome = reqBody.monthlyIncome || 0;
              userSettings.lastPlannedMonth = reqBody.lastPlannedMonth || 0;

              userSettings.gender = reqBody.gender || "o";
              userSettings.dob = reqBody.dob;
              userSettings.city = reqBody.city;
              userSettings.country = reqBody.country || "us";
              userSettings.incomeType = reqBody.incomeType || "salaried";
              userSettings.incomeSources = reqBody.incomeSources;
              userSettings.taxFrequency = reqBody.taxFrequency || "monthly";
              userSettings.taxes = reqBody.taxes;
              userSettings.houseRent = reqBody.houseRent;
              userSettings.emis = reqBody.emis;
              userSettings.bills = reqBody.bills;
              userSettings.grocery = reqBody.grocery;
              userSettings.commutes = reqBody.commutes;
              userSettings.households = reqBody.households;
              userSettings.community = reqBody.community;
              userSettings.grooming = reqBody.grooming;
              userSettings.profession = reqBody.profession;
              userSettings.eatOut = reqBody.eatOut;
              userSettings.entertainments = reqBody.entertainments;
              userSettings.hobbies = reqBody.hobbies;
              userSettings.medicines = reqBody.medicines;
              userSettings.mediclaim = reqBody.mediclaim;
              userSettings.education = reqBody.education;
              userSettings.annualBills = reqBody.annualBills;
              userSettings.others = reqBody.others;
              userSettings.family = reqBody.family;
              userSettings.friends = reqBody.friends;
              userSettings.professionalContacts = reqBody.professionalContacts;
              userSettings.isPlanPageExplained = reqBody.isPlanPageExplained;
              userSettings.isActualsPageExplained =
                reqBody.isActualsPageExplained;

              userSettings.save(function (err) {
                if (err) {
                  console.log(err);
                  res
                    .status(500)
                    .json({ message: "Something has gone wrong!" });
                  return;
                }

                res.json({
                  message: "User settings saved",
                  settings: userSettings,
                });
              });
            }
          );
        });
      });
    });

  apiRouter.route("/workitems").get(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      Workitem.find(
        {
          accountId: account.id,
        },
        function (err, workitems) {
          if (err) {
            res.send(err);
            return;
          }
          res.json(workitems);
        }
      );
    });
  });

  apiRouter
    .route("/workitem-instances/:workitemInstanceId*?")
    .get(function (req, res) {
      var id = req.params.workitemInstanceId;
      if (id == null) {
        var startDate = req.query.startdate;
        var endDate = req.query.enddate;
        var workitemId = req.query.workitemId;
        var populate = req.query.populate;

        if ((startDate == null || endDate == null) && workitemId == null) {
          res.status(400);
          res.send({
            message:
              "Please send workitem instance id or startdate, enddate or workitemId query parameters",
          });
          return;
        }
      }

      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            if (id) {
              WorkitemInstance.findOne(
                {
                  accountId: account.id,
                  _id: new ObjectId(id),
                },
                function (err, workitemInstance) {
                  if (err) {
                    res.send(err);
                    return;
                  }
                  workitemInstance = workitemInstance.toJSON();
                  var amount = 0;
                  workitemInstance.lineitems.forEach(function (li) {
                    if (li.currency === userSettings.currency) {
                      amount += Number(li.amount);
                    }
                  });
                  workitemInstance.amount = amount;
                  workitemInstance.currency = userSettings.currency;
                  workitemInstance.currencySymbol = getCurrencySymbol(
                    userSettings.currency
                  );
                  res.json(workitemInstance);
                }
              );
            } else {
              var query;
              if (startDate && endDate) {
                startDate = Number(startDate);
                endDate = Number(endDate);

                query = {
                  accountId: account.id,
                  date: { $gte: startDate, $lte: endDate },
                };
              } else if (workitemId) {
                query = {
                  accountId: account.id,
                  workitemId: new ObjectId(workitemId),
                };
              }

              if (populate == "1") {
                WorkitemInstance.find(query)
                  .populate("workitemId")
                  .sort({ date: 1 })
                  .exec(function (err, workitemInstances) {
                    if (err) {
                      res.send(err);
                      return;
                    }
                    var result = [];
                    if (workitemInstances != null) {
                      workitemInstances.forEach(function (wii) {
                        wii = wii.toJSON();
                        var amount = 0;
                        wii.lineitems.forEach(function (li) {
                          if (li.currency === userSettings.currency) {
                            amount += Number(li.amount);
                          }
                        });
                        wii.amount = amount;
                        wii.currency = userSettings.currency;
                        wii.currencySymbol = getCurrencySymbol(
                          userSettings.currency
                        );
                        wii.workitem = wii.workitemId;
                        wii.workitemId = wii.workitem.id;
                        result.push(wii);
                      });
                    }
                    res.json(result);
                  });
              } else {
                WorkitemInstance.find(
                  query,
                  {},
                  { sort: { date: 1 } },
                  function (err, workitemInstances) {
                    if (err) {
                      res.send(err);
                      return;
                    }
                    var result = [];
                    for (var i = 0, wii; (wii = workitemInstances[i]); i++) {
                      wii = wii.toJSON();
                      var amount = 0;
                      wii.lineitems.forEach(function (li) {
                        if (li.currency === userSettings.currency) {
                          amount += Number(li.amount);
                        }
                      });
                      wii.amount = amount;
                      wii.currency = userSettings.currency;
                      wii.currencySymbol = getCurrencySymbol(
                        userSettings.currency
                      );
                      result.push(wii);
                    }
                    res.json(result);
                  }
                );
              }
            }
          }
        );
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var workitemId = req.body.workitemId;
        Workitem.findOne(
          { _id: new ObjectId(workitemId) },
          function (err, workitem) {
            if (err || workitem == null) {
              res
                .status(404)
                .json({ message: "Workitem not found with id " + workitemId });
            } else {
              UserSettings.findOne(
                {
                  accountId: account.id,
                },
                function (error, userSettings) {
                  WorkitemPlan.findOne(
                    {
                      accountId: account.id,
                      workitemId: new ObjectId(workitemId),
                      month: Number(
                        getMonthStringFromDateString(req.body.date)
                      ),
                    },
                    function (wiperror, wip) {
                      var workitemInstance = new WorkitemInstance();
                      workitemInstance.workitemId = workitem.id;
                      workitemInstance.date = Number(req.body.date);
                      workitemInstance.accountId = account.id;
                      workitemInstance.lineitems = [
                        {
                          currency: userSettings.currency,
                          amount: 0,
                          comment: "",
                          tags: getRelevantTags(wip),
                          contacts: [],
                          order: 0,
                        },
                      ];

                      workitemInstance.save(function (err) {
                        if (err) {
                          console.log(err);
                          res
                            .status(500)
                            .json({ message: "Something has gone wrong!" });
                        }

                        workitemInstance = workitemInstance.toJSON();
                        var amount = 0;
                        workitemInstance.lineitems.forEach(function (li) {
                          if (li.currency === userSettings.currency) {
                            amount += Number(li.amount);
                          }
                        });
                        workitemInstance.amount = amount;

                        res.json({
                          message: "Workitem instance saved",
                          workitemInstance: workitemInstance,
                        });
                      });
                    }
                  );
                }
              );
            }
          }
        );
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            var id = req.params.workitemInstanceId;
            WorkitemInstance.findOne(
              { _id: new ObjectId(id) },
              function (err, workitemInstance) {
                if (err || workitemInstance == null) {
                  console.log(err);
                  res.status(404).json({
                    message: "Workitem instance not found with id " + id,
                  });
                } else if (workitemInstance.accountId != account.id) {
                  res.status(403).json({
                    message:
                      "Workitem instance does not belong to account " +
                      account.username,
                  });
                } else if (req.body.date == null) {
                  res.status(412).json({
                    message: "Please specify new date for workitem instance",
                  });
                } else {
                  workitemInstance.workitemId = req.body.workitemId;
                  workitemInstance.date = Number(req.body.date);
                  workitemInstance.lineitems = req.body.lineitems;
                  workitemInstance.save(function (err) {
                    if (err) {
                      console.log(err);
                      res
                        .status(500)
                        .json({ message: "Something has gone wrong!" });
                    }

                    workitemInstance = workitemInstance.toJSON();
                    var amount = 0;
                    workitemInstance.lineitems.forEach(function (li) {
                      if (li.currency === userSettings.currency) {
                        amount += Number(li.amount);
                      }
                    });
                    workitemInstance.amount = amount;
                    res.json({
                      message: "Workitem instance updated",
                      workitemInstance: workitemInstance,
                    });
                  });
                }
              }
            );
          }
        );
      });
    })
    .delete(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.workitemInstanceId;
        WorkitemInstance.findOne(
          { _id: new ObjectId(id) },
          function (err, workitemInstance) {
            if (err || workitemInstance == null) {
              console.log(err);
              res
                .status(404)
                .json({ message: "Workitem instance not found with id " + id });
            } else if (workitemInstance.accountId != account.id) {
              res.status(403).json({
                message:
                  "Workitem instance does not belong to account " +
                  account.username,
              });
            } else {
              workitemInstance.remove(function (err) {
                if (err) {
                  console.log(err);
                  res
                    .status(500)
                    .json({ message: "Something has gone wrong!" });
                  return;
                }

                workitemInstance = workitemInstance.toJSON();
                res.json({
                  message: "Workitem instance deleted",
                  workitemInstance: workitemInstance,
                });
              });
            }
          }
        );
      });
    });

  apiRouter
    .route("/workitem-plans/")
    .get(function (req, res) {
      var startMonth = req.query.startmonth;
      var endMonth = req.query.endmonth;
      var workitemId = req.query.workitemId;
      var populate = req.query.populate;
      if ((startMonth == null || endMonth == null) && workitemId == null) {
        res.status(400);
        res.send({
          message:
            "Please send startmonth, endmonth or workitemId query parameters",
        });
        return;
      }

      findItemsForThisAccount(req, res, function (account) {
        if (workitemId) {
          WorkitemPlan.find({
            accountId: account.id,
            workitemId: new ObjectId(workitemId),
          })
            .sort({ month: 1 })
            .exec(function (err, workitemPlans) {
              if (err) {
                res.send(err);
                return;
              }

              res.json(workitemPlans);
            });
        } else {
          var startMonthDate = getDateFromMonthString(startMonth);
          var endMonthDate = getDateFromMonthString(endMonth);

          Workitem.find(
            {
              accountId: account.id,
            },
            function (err, workitems) {
              UserSettings.findOne(
                {
                  accountId: account.id,
                },
                function (error, userSettings) {
                  startMonth = Number(startMonth);
                  endMonth = Number(endMonth);

                  var result = [];
                  for (
                    var d = new Date(startMonthDate);
                    d <= endMonthDate;
                    d.setMonth(d.getMonth() + 1)
                  ) {
                    workitems.forEach(function (wi) {
                      result.push({
                        accountId: account.id,
                        workitemId: populate == "1" ? wi : wi._id,
                        amount: 0,
                        lineitems: [
                          {
                            currency: userSettings.currency,
                            amount: 0,
                            comment: "",
                            tags: [],
                            contacts: [],
                            order: 0,
                          },
                        ],
                        month: getMonthStringFromDate(d),
                      });
                    });
                  }

                  var latestWorkitemPlans = {};

                  if (populate == "1") {
                    WorkitemPlan.find({
                      accountId: account.id,
                      month: {
                        $gte: startMonth,
                        $lte: endMonth,
                      },
                    })
                      .populate("workitemId")
                      .sort({ month: 1 })
                      .exec(function (err, workitemPlans) {
                        if (err) {
                          res.send(err);
                          return;
                        }
                        for (var j = 0, wip; (wip = result[j]); j++) {
                          var found = false;
                          for (
                            var i = 0, workitemPlan;
                            (workitemPlan = workitemPlans[i]);
                            i++
                          ) {
                            workitemPlan = workitemPlan.toJSON();
                            if (
                              wip.workitemId.id ===
                                workitemPlan.workitemId.id &&
                              wip.month === workitemPlan.month
                            ) {
                              var amount = 0;
                              workitemPlan.lineitems.forEach(function (li) {
                                if (li.currency === userSettings.currency) {
                                  amount += Number(li.amount);
                                }
                              });
                              result[j] = {
                                _id: workitemPlan._id,
                                workitem: workitemPlan.workitemId,
                                workitemId: workitemPlan.workitemId.id,
                                lineitems: workitemPlan.lineitems,
                                month: workitemPlan.month,
                                amount: amount,
                              };
                              latestWorkitemPlans[workitemPlan.workitemId.id] =
                                workitemPlan.lineitems;
                              found = true;
                              break;
                            }
                          }

                          if (!found) {
                            // create workitem plans for new months
                            var newWorkitemPlan = new WorkitemPlan();
                            newWorkitemPlan.accountId = account.id;
                            newWorkitemPlan.workitemId = wip.workitemId._id;
                            newWorkitemPlan.month = Number(wip.month);
                            newWorkitemPlan.lineitems = latestWorkitemPlans[
                              wip.workitemId.id
                            ]
                              ? latestWorkitemPlans[wip.workitemId.id]
                                  .lineitems || []
                              : [];
                            newWorkitemPlan.save(function (err) {
                              if (err) {
                                console.log(err);
                                res.status(500).json({
                                  message: "Something has gone wrong!",
                                });
                              }
                            });

                            var amount = 0;
                            newWorkitemPlan.lineitems.forEach(function (li) {
                              if (li.currency === userSettings.currency) {
                                amount += Number(li.amount);
                              }
                            });
                            result[j] = {
                              _id: newWorkitemPlan._id,
                              workitem: wip.workitemId,
                              workitemId: wip.workitemId._id,
                              lineitems: newWorkitemPlan.lineitems,
                              month: newWorkitemPlan.month,
                              amount: amount,
                            };
                          }
                        }

                        if (endMonth > userSettings.lastPlannedMonth) {
                          userSettings.lastPlannedMonth = endMonth;
                          userSettings.save(function (err, settings) {
                            if (err) {
                              console.log(err);
                              res.status(500).json({
                                message: "Something has gone wrong!",
                                error: JSON.stringify(err),
                              });
                            }
                            console.log("Updated user settings: " + settings);
                          });
                        }
                        res.json(result);
                      });
                  } else {
                    var lastYear = startMonth - 100;
                    WorkitemPlan.find({
                      accountId: account.id,
                      month: {
                        $gte: lastYear,
                        $lte: endMonth,
                      },
                    })
                      .sort({ month: 1 })
                      .exec(function (err, workitemPlans) {
                        if (err) {
                          res.send(err);
                          return;
                        }
                        for (var j = 0, wip; (wip = result[j]); j++) {
                          var found = false;
                          for (
                            var i = 0, workitemPlan;
                            (workitemPlan = workitemPlans[i]);
                            i++
                          ) {
                            if (workitemPlan.month > wip.month) {
                              break;
                            }
                            workitemPlan = workitemPlan.toJSON();
                            if (
                              wip.workitemId.toString() ===
                                workitemPlan.workitemId.toString() &&
                              wip.month === workitemPlan.month
                            ) {
                              var amount = 0;
                              workitemPlan.lineitems.forEach(function (li) {
                                if (li.currency === userSettings.currency) {
                                  li.amount = Number(li.amount);
                                  amount += li.amount;
                                }
                              });
                              result[j] = {
                                accountId: workitemPlan.accountId,
                                _id: workitemPlan._id,
                                workitemId: workitemPlan.workitemId,
                                lineitems: workitemPlan.lineitems,
                                month: workitemPlan.month,
                                amount: amount,
                              };
                              latestWorkitemPlans[workitemPlan.workitemId] =
                                workitemPlan.lineitems;
                              found = true;
                              break;
                            }
                          }
                          if (!found && latestWorkitemPlans[wip.workitemId]) {
                            // create workitem plans for new months
                            var newWorkitemPlan = new WorkitemPlan();
                            newWorkitemPlan.accountId = account.id;
                            newWorkitemPlan.workitemId = wip.workitemId;
                            newWorkitemPlan.month = Number(wip.month);
                            newWorkitemPlan.lineitems =
                              latestWorkitemPlans[wip.workitemId];
                            for (var k = 0; k < i; k++) {
                              var previousPlan = workitemPlans[k];
                              if (
                                previousPlan.month ===
                                  newWorkitemPlan.month - 100 &&
                                previousPlan.workitemId.toString() ===
                                  newWorkitemPlan.workitemId.toString()
                              ) {
                                for (
                                  var l = 0, lastYearLi;
                                  (lastYearLi = previousPlan.lineitems[l]);
                                  l++
                                ) {
                                  if (lastYearLi.repeatMode === "annual") {
                                    var annualLiExists = false;
                                    newWorkitemPlan.lineitems.forEach(function (
                                      newLi
                                    ) {
                                      if (newLi.id === lastYearLi.id) {
                                        newLi.amount = lastYearLi.amount;
                                        newLi.comment = lastYearLi.comment;
                                        newLi.currency = lastYearLi.currency;
                                        newLi.tags = lastYearLi.tags;
                                        newLi.contacts = lastYearLi.contacts;
                                        newLi.repeatMode =
                                          lastYearLi.repeatMode;
                                        newLi.repeatFrom =
                                          lastYearLi.repeatFrom;
                                        annualLiExists = true;
                                      }
                                    });
                                    if (!annualLiExists) {
                                      newWorkitemPlan.lineitems.push({
                                        amount: lastYearLi.amount,
                                        comment: lastYearLi.comment,
                                        currency: lastYearLi.currency,
                                        tags: lastYearLi.tags,
                                        contacts: lastYearLi.contacts,
                                        repeatMode: lastYearLi.repeatMode,
                                        repeatFrom: lastYearLi.repeatFrom,
                                      });
                                    }
                                  }
                                }
                                break;
                              }
                            }
                            newWorkitemPlan.save(function (err) {
                              if (err) {
                                console.log(err);
                                res.status(500).json({
                                  message: "Something has gone wrong!",
                                });
                              }
                            });

                            var amount = 0;
                            newWorkitemPlan.lineitems.forEach(function (li) {
                              if (li.currency === userSettings.currency) {
                                amount += Number(li.amount);
                              }
                            });
                            result[j] = {
                              accountId: newWorkitemPlan.accountId,
                              _id: newWorkitemPlan._id,
                              workitem: newWorkitemPlan.workitemId,
                              workitemId: newWorkitemPlan.workitemId.id,
                              lineitems: newWorkitemPlan.lineitems,
                              month: newWorkitemPlan.month,
                              amount: amount,
                            };
                          }
                        }

                        if (endMonth > userSettings.lastPlannedMonth) {
                          userSettings.lastPlannedMonth = endMonth;
                          userSettings.save(function (err, settings) {
                            if (err) {
                              console.log(err);
                              res.status(500).json({
                                message: "Something has gone wrong!",
                                error: JSON.stringify(err),
                              });
                            }
                            console.log("Updated user settings: " + settings);
                          });
                        }
                        res.json(result);
                      });
                  }
                }
              );
            }
          );
        }
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            if (req.body.month == null) {
              res
                .status(412)
                .json({ message: "Please specify month for workitem plan" });
              return;
            } else if (req.body.workitemId == null) {
              res.status(412).json({
                message: "Please specify workitem id for workitem plan",
              });
              return;
            }

            var workitemId = req.body.workitemId;
            var month = Number(req.body.month);
            var modifiedLineitem = req.body.modifiedLineitem;

            WorkitemPlan.findOne(
              {
                accountId: account.id,
                workitemId: workitemId,
                month: month,
              },
              function (err, workitemPlan) {
                if (err) {
                  console.log(err);
                  res.status(404).json({
                    message:
                      "Error while fetching Workitem plan with id " +
                      workitemId,
                  });
                  return;
                } else if (workitemPlan == null) {
                  //create new
                  workitemPlan = new WorkitemPlan();
                  workitemPlan.accountId = account.id;
                  workitemPlan.workitemId = workitemId;
                  workitemPlan.month = month;
                } else if (workitemPlan.accountId != account.id) {
                  res.status(403).json({
                    message:
                      "Workitem plan does not belong to account " +
                      account.username,
                  });
                  return;
                }

                workitemPlan.lineitems = req.body.lineitems;
                if (modifiedLineitem) {
                  workitemPlan.lineitems.forEach(function (li) {
                    if (li.id === modifiedLineitem.id) {
                      li.repeatMode = modifiedLineitem.repeatMode;
                      li.repeatFrom = month;
                    }
                  });
                }
                workitemPlan.save(function (err) {
                  if (err) {
                    console.log(err);
                    res
                      .status(500)
                      .json({ message: "Something has gone wrong!" });
                  }

                  workitemPlan = workitemPlan.toJSON();
                  var amount = 0;
                  workitemPlan.lineitems.forEach(function (li) {
                    if (li.currency === userSettings.currency) {
                      amount += Number(li.amount);
                    }
                  });
                  workitemPlan.amount = amount;

                  var repeatMode = modifiedLineitem
                    ? modifiedLineitem.repeatMode
                    : null;
                  if (repeatMode === "monthly" || repeatMode === "annual") {
                    // update the modified lineitem in all consecutive months or annual
                    if (repeatMode === "monthly") {
                      WorkitemPlan.find(
                        {
                          accountId: account.id,
                          workitemId: workitemId,
                          month: {
                            $gt: month,
                          },
                        },
                        function (err, workitemPlans) {
                          if (err) {
                            console.log(err);
                            res.status(404).json({
                              message:
                                "Error while fetching Workitem plans for account " +
                                account.id,
                            });
                            return;
                          }
                          var promises = [];

                          workitemPlans.forEach(function (wip) {
                            var lis = wip.lineitems;
                            wip.lineitems = [];
                            var found = false;
                            for (var k = 0, li; (li = lis[k]); k++) {
                              if (li.id === modifiedLineitem.id) {
                                li.amount = modifiedLineitem.amount;
                                li.comment = modifiedLineitem.comment;
                                li.currency = modifiedLineitem.currency;
                                li.tags = modifiedLineitem.tags;
                                li.contacts = modifiedLineitem.contacts;
                                li.repeatMode = repeatMode;
                                li.repeatFrom = month;
                                found = true;
                              }
                              wip.lineitems.push(li);
                            }
                            if (!found) {
                              modifiedLineitem.order = wip.lineitems.length;
                              wip.lineitems.push(modifiedLineitem);
                            }
                            promises.push(wip.save());
                          });

                          Promise.all(promises).then(function () {
                            var futureWip = [];
                            workitemPlans.forEach(function (wip) {
                              wip = wip.toJSON();
                              var amount = 0;
                              wip.lineitems.forEach(function (li) {
                                if (li.currency === userSettings.currency) {
                                  amount += Number(li.amount);
                                }
                              });
                              wip.amount = amount;
                              futureWip.push(wip);
                            });
                            res.json({
                              message: "Workitem plans updated",
                              workitemPlan: workitemPlan,
                              futurePlans: futureWip,
                            });
                            return;
                          });
                        }
                      );
                    } else if (repeatMode === "annual") {
                      var nextYearMonth = month + 100;
                      WorkitemPlan.findOne(
                        {
                          accountId: account.id,
                          workitemId: workitemId,
                          month: nextYearMonth,
                        },
                        function (err, nextYearPlan) {
                          if (err) {
                            console.log(err);
                            res.status(404).json({
                              message:
                                "Error while fetching Workitem plans for account " +
                                account.id,
                            });
                            return;
                          }

                          if (nextYearPlan == null) {
                            res.json({
                              message: "Workitem plans updated",
                              workitemPlan: workitemPlan,
                            });
                            return;
                          }

                          var lis = nextYearPlan.lineitems;
                          nextYearPlan.lineitems = [];
                          var found = false;
                          for (var k = 0, li; (li = lis[k]); k++) {
                            if (li.id === modifiedLineitem.id) {
                              li.amount = modifiedLineitem.amount;
                              li.comment = modifiedLineitem.comment;
                              li.currency = modifiedLineitem.currency;
                              li.tags = modifiedLineitem.tags;
                              li.contacts = modifiedLineitem.contacts;
                              li.repeatMode = repeatMode;
                              li.repeatFrom = month;
                              found = true;
                            }
                            nextYearPlan.lineitems.push(li);
                          }
                          if (!found) {
                            modifiedLineitem.order =
                              nextYearPlan.lineitems.length;
                            nextYearPlan.lineitems.push(modifiedLineitem);
                          }

                          nextYearPlan.save(function () {
                            res.json({
                              message: "Workitem plans updated",
                              workitemPlan: workitemPlan,
                            });
                            return;
                          });
                        }
                      );
                    }
                  } else {
                    res.json({
                      message: "Workitem plan updated",
                      workitemPlan: workitemPlan,
                    });
                  }
                });
              }
            );
          }
        );
      });
    });

  apiRouter.route("/workitem-plan-lineitems/").post(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      if (req.body.month == null) {
        res
          .status(412)
          .json({ message: "Please specify month for workitem plan" });
        return;
      } else if (req.body.workitemId == null) {
        res.status(412).json({ message: "Please specify workitem id" });
        return;
      } else if (req.body.lineitemId == null) {
        res.status(412).json({ message: "Please specify lineitem id" });
        return;
      } else if (req.body.action !== "delete-all") {
        res
          .status(412)
          .json({ message: "Please specify action to delete-all" });
        return;
      }

      var month = Number(req.body.month);
      var workitemId = req.body.workitemId;
      var lineitemId = req.body.lineitemId;

      UserSettings.findOne(
        {
          accountId: account.id,
        },
        function (error, userSettings) {
          WorkitemPlan.find(
            {
              accountId: account.id,
              workitemId: workitemId,
              month: {
                $gte: month,
              },
            },
            function (err, workitemPlans) {
              if (err) {
                console.log(err);
                res.status(404).json({
                  message:
                    "Error while fetching Workitem plan for workitem id " +
                    workitemId,
                });
                return;
              }

              var promises = [];
              workitemPlans.forEach(function (workitemPlan) {
                for (var i = 0, li; (li = workitemPlan.lineitems[i]); i++) {
                  if (li.id === lineitemId) {
                    workitemPlan.lineitems.splice(i, 1);
                    break;
                  }
                }

                var order = 0;
                workitemPlan.lineitems.forEach(function (li) {
                  li.order = order;
                  order++;
                });

                promises.push(workitemPlan.save());
              });

              Promise.all(promises).then(function () {
                var modifiedWip = [];
                workitemPlans = _.sortBy(workitemPlans, function (wip) {
                  return wip.month;
                });

                workitemPlans.forEach(function (wip) {
                  wip = wip.toJSON();
                  var amount = 0;
                  wip.lineitems.forEach(function (li) {
                    if (li.currency === userSettings.currency) {
                      amount += Number(li.amount);
                    }
                  });
                  wip.amount = amount;
                  modifiedWip.push(wip);
                });
                res.json({
                  message: "Workitem plans updated",
                  workitemPlan: modifiedWip[0],
                  futurePlans: modifiedWip.slice(1),
                });
              });
            }
          );
        }
      );
    });
  });

  apiRouter.route("/default-workitem-plans").post(function (req, res) {
    var currency = req.body.currency || "USD";
    var monthlyIncome = req.body.monthlyIncome || 0;
    var tagsToBeCreated = [];

    findItemsForThisAccount(req, res, function (account) {
      Workitem.find(
        {
          accountId: account.id,
        },
        function (err, workitems) {
          if (err) {
            console.log(err);
            res.status(404).json({
              message: "Error while fetching Workitems with id " + id,
            });
            return;
          } else if (req.body.month == null) {
            res
              .status(412)
              .json({ message: "Please specify new month for workitem plan" });
            return;
          }

          var promises = [];
          var prePlanForMonths = 24; //pre plan for next 24 months
          var lastPlannedMonth = null;
          var frequency = "monthly";
          workitems.forEach(function (wi) {
            frequency = "monthly";
            var idForLi = Math.floor(Math.random() * 1000000000);
            var lineitems = [
              {
                id: idForLi,
                currency: currency,
                amount: 0,
                comment: "",
                tags: [],
                contacts: [],
                order: 0,
                repeatMode: "monthly",
                repeatFrom: req.body.month,
              },
            ];

            // create lineitems for each type of workitem based on user settings sent in request
            if (wi.name === "Income") {
              var incomeSources = req.body.incomeSources;
              if (incomeSources) {
                lineitems = [];
                var liOrder = 0;
                incomeSources.forEach(function (income) {
                  if (income.source.length && income.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: income.amount,
                      comment: "",
                      tags: [income.source],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(income.source);
                  }
                });
              }
            } else if (wi.name === "Taxes") {
              frequency = req.body.taxFrequency;
              var taxes = req.body.taxes;
              if (taxes) {
                lineitems = [];
                var liOrder = 0;
                taxes.forEach(function (tax) {
                  if (tax.type.length && tax.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: tax.amount,
                      comment: "",
                      tags: [tax.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(tax.type);
                  }
                });
              }
            } else if (wi.name === "Grocery") {
              var grocery = req.body.grocery;
              if (grocery) {
                lineitems = [];
                if (grocery.food > 0) {
                  idForLi = Math.floor(Math.random() * 1000000000);
                  lineitems.push({
                    id: idForLi,
                    currency: currency,
                    amount: grocery.food,
                    comment: "",
                    tags: ["Food"],
                    contacts: [],
                    order: 0,
                    repeatMode: "monthly",
                    repeatFrom: req.body.month,
                  });
                }
                tagsToBeCreated.push("Food");
                if (grocery.nonFood > 0) {
                  idForLi = Math.floor(Math.random() * 1000000000);
                  lineitems.push({
                    id: idForLi,
                    currency: currency,
                    amount: grocery.nonFood,
                    comment: "",
                    tags: ["Non Food"],
                    contacts: [],
                    order: 0,
                    repeatMode: "monthly",
                    repeatFrom: req.body.month,
                  });
                }
                tagsToBeCreated.push("Non Food");
              }
            } else if (wi.name === "House Rent") {
              var houseRent = req.body.houseRent;
              if (houseRent) {
                lineitems = [];
                idForLi = Math.floor(Math.random() * 1000000000);
                lineitems.push({
                  id: idForLi,
                  currency: currency,
                  amount: houseRent,
                  comment: "",
                  tags: ["House Rent"],
                  contacts: [],
                  order: 0,
                  repeatMode: "monthly",
                  repeatFrom: req.body.month,
                });
                tagsToBeCreated.push("House Rent");
              }
            } else if (wi.name === "Bills and EMI") {
              var emis = req.body.emis;
              lineitems = [];
              if (emis) {
                var liOrder = 0;
                emis.forEach(function (emi) {
                  if (emi.type.length && emi.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: emi.amount,
                      comment: "",
                      tags: [emi.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(emi.type);
                  }
                });
              }
              var bills = req.body.bills;
              if (bills) {
                var liOrder = 0;
                bills.forEach(function (bill) {
                  if (bill.type.length && bill.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: bill.amount,
                      comment: "",
                      tags: [bill.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(bill.type);
                  }
                });
              }
            } else if (wi.name === "Travel and Vacation") {
              var commutes = req.body.commutes;
              if (commutes) {
                lineitems = [];
                var liOrder = 0;
                commutes.forEach(function (commute) {
                  if (commute.type.length && commute.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: commute.amount,
                      comment: "",
                      tags: [commute.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(commute.type);
                  }
                });
              }
            } else if (wi.name === "Entertainment") {
              var entertainments = req.body.entertainments;
              if (entertainments) {
                lineitems = [];
                var liOrder = 0;
                entertainments.forEach(function (entertainment) {
                  if (entertainment.type.length && entertainment.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: entertainment.amount,
                      comment: "",
                      tags: [entertainment.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(entertainment.type);
                  }
                });
              }
            } else if (wi.name === "Eat out") {
              var eatOut = req.body.eatOut;
              if (eatOut) {
                lineitems = [];
                idForLi = Math.floor(Math.random() * 1000000000);
                lineitems.push({
                  id: idForLi,
                  currency: currency,
                  amount: eatOut,
                  comment: "",
                  tags: ["Eat Out"],
                  contacts: [],
                  order: 0,
                  repeatMode: "monthly",
                  repeatFrom: req.body.month,
                });
              }
              tagsToBeCreated.push("Eat Out");
            } else if (wi.name === "Fitness, Leisure and Hobby") {
              var hobbies = req.body.hobbies;
              if (hobbies) {
                lineitems = [];
                var liOrder = 0;
                hobbies.forEach(function (hobby) {
                  if (hobby.type.length && hobby.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: hobby.amount,
                      comment: "",
                      tags: [hobby.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(hobby.type);
                  }
                });
              }
            } else if (wi.name === "Health and Medicine") {
              var medicines = req.body.medicines;
              if (medicines) {
                lineitems = [];
                idForLi = Math.floor(Math.random() * 1000000000);
                lineitems.push({
                  id: idForLi,
                  currency: currency,
                  amount: medicines,
                  comment: "",
                  tags: ["Health and Medicine"],
                  contacts: [],
                  order: 0,
                  repeatMode: "monthly",
                  repeatFrom: req.body.month,
                });
              }
              tagsToBeCreated.push("Health and Medicine");
            } else if (wi.name === "Domestic and Household") {
              var households = req.body.households;
              if (households) {
                lineitems = [];
                var liOrder = 0;
                households.forEach(function (household) {
                  if (household.type.length && household.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: household.amount,
                      comment: "",
                      tags: [household.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(household.type);
                  }
                });
              }
            } else if (wi.name === "Community and Festivals") {
              var community = req.body.community;
              if (community) {
                lineitems = [];
                var liOrder = 0;
                community.forEach(function (comm) {
                  if (comm.type.length && comm.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: comm.amount,
                      comment: "",
                      tags: [comm.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(comm.type);
                  }
                });
              }
            } else if (wi.name === "Clothing and Grooming") {
              var grooming = req.body.grooming;
              if (grooming) {
                lineitems = [];
                var liOrder = 0;
                grooming.forEach(function (groom) {
                  if (groom.type.length && groom.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: groom.amount,
                      comment: "",
                      tags: [groom.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(groom.type);
                  }
                });
              }
            } else if (wi.name === "Business and Profession") {
              var profession = req.body.profession;
              if (profession) {
                lineitems = [];
                var liOrder = 0;
                profession.forEach(function (prof) {
                  if (prof.type.length && prof.amount) {
                    idForLi = Math.floor(Math.random() * 1000000000);
                    lineitems.push({
                      id: idForLi,
                      currency: currency,
                      amount: prof.amount,
                      comment: "",
                      tags: [prof.type],
                      contacts: [],
                      order: liOrder,
                      repeatMode: "monthly",
                      repeatFrom: req.body.month,
                    });
                    liOrder++;
                    tagsToBeCreated.push(prof.type);
                  }
                });
              }
            } else if (wi.name === "Education") {
              var education = req.body.education;
              if (education) {
                lineitems = [];
                idForLi = Math.floor(Math.random() * 1000000000);
                lineitems.push({
                  id: idForLi,
                  currency: currency,
                  amount: education,
                  comment: "",
                  tags: ["Education"],
                  contacts: [],
                  order: 0,
                  repeatMode: "monthly",
                  repeatFrom: req.body.month,
                });
              }
              tagsToBeCreated.push("Education");
            } else if (wi.name === "Others") {
              var others = req.body.others;
              if (others) {
                lineitems = [];
                idForLi = Math.floor(Math.random() * 1000000000);
                lineitems.push({
                  id: idForLi,
                  currency: currency,
                  amount: others,
                  comment: "",
                  tags: [],
                  contacts: [],
                  order: 0,
                  repeatMode: "monthly",
                  repeatFrom: req.body.month,
                });
              }
            }

            for (var counter = 0; counter < prePlanForMonths; counter++) {
              var month = getDateFromMonthString(req.body.month);
              month.setMonth(month.getMonth() + counter);

              //take care of annual lineitems here
              var mediclaim = req.body.mediclaim;
              var annualLineItems = [];
              var annualItemPlanMonth = parseInt(
                req.body.mediclaim.date.toString().substr(0, 6)
              );
              if (
                mediclaim &&
                wi.name === "Bills and EMI" &&
                getMonthStringFromDate(month) === annualItemPlanMonth
              ) {
                idForLi = Math.floor(Math.random() * 1000000000);
                annualLineItems.push({
                  id: idForLi,
                  currency: currency,
                  amount: mediclaim.amount,
                  comment: "",
                  tags: [mediclaim.type],
                  contacts: [],
                  order: 0,
                  repeatMode: "annual",
                  repeatFrom: annualItemPlanMonth,
                });
                tagsToBeCreated.push(mediclaim.type);
              }

              var annualBills = req.body.annualBills;
              annualBills.forEach(function (annualBill) {
                annualItemPlanMonth = parseInt(
                  annualBill.date.toString().substr(0, 6)
                );
                if (
                  annualBill &&
                  wi.name === "Bills and EMI" &&
                  getMonthStringFromDate(month) === annualItemPlanMonth
                ) {
                  idForLi = Math.floor(Math.random() * 1000000000);
                  annualLineItems.push({
                    id: idForLi,
                    currency: currency,
                    amount: annualBill.amount,
                    comment: "",
                    tags: [annualBill.type],
                    contacts: [],
                    order: 0,
                    repeatMode: "annual",
                    repeatFrom: annualItemPlanMonth,
                  });
                  tagsToBeCreated.push(annualBill.type);
                }
              });

              var workitemPlan = new WorkitemPlan();
              workitemPlan.accountId = account.id;
              workitemPlan.workitemId = wi.id;
              workitemPlan.month = getMonthStringFromDate(month);
              workitemPlan.lineitems = [];

              if (
                frequency === "monthly" ||
                (frequency === "quarterly" && (month.getMonth() + 1) % 3 === 0)
              ) {
                workitemPlan.lineitems = lineitems.concat(annualLineItems);
              }

              promises.push(workitemPlan.save());
              lastPlannedMonth = month;
            }
          });
          Promise.all(promises).then(
            function () {
              UserSettings.findOne(
                { accountId: account.id },
                function (err, userSettings) {
                  if (err || userSettings == null) {
                    userSettings = new UserSettings();
                  }

                  userSettings.accountId = account.id;
                  userSettings.lastPlannedMonth = Number(
                    getMonthStringFromDate(lastPlannedMonth)
                  );
                  userSettings.save(function (err) {
                    if (err) {
                      console.log(err);
                      res
                        .status(500)
                        .json({ message: "Something has gone wrong!" });
                    }

                    console.log("User settings saved" + userSettings);

                    tagsToBeCreated.forEach(function (tag) {
                      var tagModel = new Tag();
                      tagModel.name = tag.toLowerCase();
                      tagModel.displayName = tag;
                      tagModel.accountId = account.id;

                      tagModel.save();
                    });
                    res.json({ message: "Default workitem plans created" });
                  });
                }
              );
            },
            function (err) {
              if (err) {
                console.log(err);
                res.status(500).json({ message: "Something has gone wrong!" });
              }
            }
          );
        }
      );
    });
  });

  apiRouter
    .route("/cash-at-home/:cashAtHomeInstanceId*?")
    .get(function (req, res) {
      var id = req.params.cashAtHomeInstanceId;
      if (id == null) {
        var startDate = req.query.startdate;
        var endDate = req.query.enddate;
      }

      findItemsForThisAccount(req, res, function (account) {
        if (startDate == null || endDate == null) {
          CashAtHomeInstance.findOne(
            {
              accountId: account.id,
            },
            {},
            { sort: { date: -1 } },
            function (err, latestCashAtHome) {
              res.json(latestCashAtHome);
            }
          );
        } else if (id) {
          CashAtHomeInstance.findOne(
            {
              accountId: account.id,
              _id: new ObjectId(id),
            },
            function (err, cashAtHomeInstance) {
              if (err) {
                res.send(err);
                return;
              }
              cashAtHomeInstance = cashAtHomeInstance.toJSON();
              res.json(cashAtHomeInstance);
            }
          );
        } else {
          startDate = Number(startDate);
          endDate = Number(endDate);
          CashAtHomeInstance.find(
            {
              accountId: account.id,
              date: { $gte: startDate, $lte: endDate },
            },
            function (err, cashAtHomeInstances) {
              if (err) {
                res.send(err);
                return;
              }
              var result = [];
              for (
                var i = 0, cashAtHomeInstance;
                (cashAtHomeInstance = cashAtHomeInstances[i]);
                i++
              ) {
                cashAtHomeInstance = cashAtHomeInstance.toJSON();
                cashAtHomeInstance.amount = Number(cashAtHomeInstance.amount);
                result.push(cashAtHomeInstance);
              }
              res.json(result);
            }
          );
        }
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var cashAtHomeInstance = new CashAtHomeInstance();
        cashAtHomeInstance.date = Number(req.body.date);
        cashAtHomeInstance.accountId = account.id;
        cashAtHomeInstance.currency = req.body.currency || "USD";
        cashAtHomeInstance.amount = req.body.amount || 0;
        cashAtHomeInstance.save(function (err) {
          if (err) {
            console.log(err);
            res.status(500).json({ message: "Something has gone wrong!" });
          }

          cashAtHomeInstance = cashAtHomeInstance.toJSON();
          cashAtHomeInstance.amount = Number(cashAtHomeInstance.amount);
          res.json({
            message: "Cash at home instance saved",
            cashAtHomeInstance: cashAtHomeInstance,
          });
        });
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.cashAtHomeInstanceId;
        CashAtHomeInstance.findOne(
          { _id: new ObjectId(id) },
          function (err, cashAtHomeInstance) {
            if (err || cashAtHomeInstance == null) {
              console.log(err);
              res.status(404).json({
                message: "Cash at home instance not found with id " + id,
              });
            } else if (cashAtHomeInstance.accountId != account.id) {
              res.status(403).json({
                message:
                  "Cash at home instance does not belong to account " +
                  account.username,
              });
            } else if (req.body.date == null) {
              res.status(412).json({
                message: "Please specify new date for Cash at home instance",
              });
            } else {
              cashAtHomeInstance.date = Number(req.body.date);
              cashAtHomeInstance.currency = req.body.currency || "USD";
              cashAtHomeInstance.amount = req.body.amount || 0;
              cashAtHomeInstance.save(function (err) {
                if (err) {
                  console.log(err);
                  res
                    .status(500)
                    .json({ message: "Something has gone wrong!" });
                }

                cashAtHomeInstance = cashAtHomeInstance.toJSON();
                cashAtHomeInstance.amount = Number(cashAtHomeInstance.amount);
                res.json({
                  message: "Cash at home instance updated",
                  cashAtHomeInstance: cashAtHomeInstance,
                });
              });
            }
          }
        );
      });
    })
    .delete(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.cashAtHomeInstanceId;
        CashAtHomeInstance.findOne(
          { _id: new ObjectId(id) },
          function (err, cashAtHomeInstance) {
            if (err || cashAtHomeInstance == null) {
              console.log(err);
              res.status(404).json({
                message: "Cash at home instance not found with id " + id,
              });
            } else if (cashAtHomeInstance.accountId != account.id) {
              res.status(403).json({
                message:
                  "Cash at home instance does not belong to account " +
                  account.username,
              });
            } else {
              cashAtHomeInstance.remove(function (err) {
                if (err) {
                  console.log(err);
                  res
                    .status(500)
                    .json({ message: "Something has gone wrong!" });
                }

                cashAtHomeInstance = cashAtHomeInstance.toJSON();
                cashAtHomeInstance.amount = Number(cashAtHomeInstance.amount);
                res.json({
                  message: "Cash at home instance deleted",
                  cashAtHomeInstance: cashAtHomeInstance,
                });
              });
            }
          }
        );
      });
    });

  apiRouter
    .route("/cash-at-home-plans/")
    .get(function (req, res) {
      var startMonth = req.query.startmonth;
      var endMonth = req.query.endmonth;
      if (startMonth == null || endMonth == null) {
        res.status(400);
        res.send({
          message: "Please send startmonth and endmonth query parameters",
        });
        return;
      }
      var startMonthDate = getDateFromMonthString(startMonth);
      var endMonthDate = getDateFromMonthString(endMonth);

      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            var result = [];
            for (
              var d = new Date(startMonthDate);
              d <= endMonthDate;
              d.setMonth(d.getMonth() + 1)
            ) {
              result.push({
                accountId: account.id,
                currency: userSettings.currency,
                amount: 0,
                month: getMonthStringFromDate(d),
              });
            }

            startMonth = Number(startMonth);
            endMonth = Number(endMonth);

            CashAtHomePlan.find(
              {
                accountId: account.id,
                month: {
                  $gte: startMonth,
                  $lte: endMonth,
                },
              },
              function (err, cashAtHomePlans) {
                if (err) {
                  res.send(err);
                  return;
                }
                for (
                  var i = 0, cashAtHomePlan;
                  (cashAtHomePlan = cashAtHomePlans[i]);
                  i++
                ) {
                  cashAtHomePlan = cashAtHomePlan.toJSON();
                  for (var j = 0, cahp; (cahp = result[j]); j++) {
                    if (cahp.month === cashAtHomePlan.month) {
                      result[j] = {
                        _id: cashAtHomePlan._id,
                        currency: cashAtHomePlan.currency,
                        amount: cashAtHomePlan.amount,
                        month: cashAtHomePlan.month,
                      };
                    }
                  }
                }
                res.json(result);
              }
            );
          }
        );
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        if (req.body.month == null) {
          res
            .status(412)
            .json({ message: "Please specify month for cash at home plan" });
          return;
        }
        var month = Number(req.body.month);
        CashAtHomePlan.findOne(
          {
            accountId: account.id,
            month: month,
          },
          function (err, cashAtHomePlan) {
            if (err) {
              console.log(err);
              res.status(404).json({
                message:
                  "Error while fetching Cash at home plan for month " + month,
              });
              return;
            } else if (cashAtHomePlan == null) {
              //create new
              cashAtHomePlan = new CashAtHomePlan();
              cashAtHomePlan.accountId = account.id;
              cashAtHomePlan.month = month;
            } else if (cashAtHomePlan.accountId != account.id) {
              res.status(403).json({
                message:
                  "Cash at home plan does not belong to account " +
                  account.username,
              });
              return;
            }

            cashAtHomePlan.currency = req.body.currency || "USD";
            cashAtHomePlan.amount = req.body.amount || 0;
            cashAtHomePlan.save(function (err) {
              if (err) {
                console.log(err);
                res.status(500).json({ message: "Something has gone wrong!" });
              }

              cashAtHomePlan = cashAtHomePlan.toJSON();
              res.json({
                message: "Cash at home plan updated",
                cashAtHomePlan: cashAtHomePlan,
              });
            });
          }
        );
      });
    });

  function createOrUpdateGivenReceivedInstance(req, res, account, contact) {
    var id = req.params.givenReceivedInstanceId;
    GivenReceivedInstance.findOne(
      { _id: new ObjectId(id) },
      function (err, givenReceivedInstance) {
        if (err) {
          console.log(err);
          res
            .status(404)
            .json({ message: "Error updating Given received instance" });
        } else if (
          givenReceivedInstance &&
          givenReceivedInstance.accountId != account.id
        ) {
          res.status(403).json({
            message:
              "Given received instance does not belong to account " +
              account.username,
          });
        } else if (req.body.date == null) {
          res.status(412).json({
            message: "Please specify new date for Given received instance",
          });
        }

        var givenReceivedInstance =
          givenReceivedInstance || new GivenReceivedInstance();
        givenReceivedInstance.date = Number(req.body.date);
        givenReceivedInstance.accountId = account.id;
        givenReceivedInstance.currency = req.body.currency || "USD";
        givenReceivedInstance.amount = req.body.amount || 0;
        givenReceivedInstance.actualOrPlanned =
          getActualOrPlannedNumberFromString(
            req.body.actualOrPlanned || "actual"
          ); //0 - actual, 1 - planned
        givenReceivedInstance.givenOrReceived =
          getGivenOrReceivedNumberFromString(
            req.body.givenOrReceived || "given"
          ); //0- given, 1 - received
        givenReceivedInstance.toWhom = contact;
        givenReceivedInstance.comment = req.body.comment || "";
        givenReceivedInstance.linkedPlanId = req.body.linkedPlanId || undefined;
        givenReceivedInstance.tags = req.body.tags || [];
        givenReceivedInstance.remainingAmount = req.body.remainingAmount || 0;
        givenReceivedInstance.save(function (err) {
          if (err) {
            console.log(err);
            res.status(500).json({ message: "Something has gone wrong!" });
          }

          var linkedPlanId = req.body.linkedPlanId;
          if (linkedPlanId) {
            GivenReceivedInstance.findOne(
              { _id: new ObjectId(linkedPlanId) },
              function (err, linkedPlan) {
                if (linkedPlan) {
                  linkedPlan.isResolved = req.body.isResolved || false;
                  linkedPlan.remainingAmount =
                    Number(linkedPlan.remainingAmount) -
                    Number(givenReceivedInstance.amount);
                  givenReceivedInstance.remainingAmount =
                    linkedPlan.remainingAmount;
                  linkedPlan.save(function (errPlan) {
                    if (errPlan) {
                      console.log(errPlan);
                      res
                        .status(500)
                        .json({ message: "Something has gone wrong!" });
                    }
                  });
                }
              }
            );
          }

          givenReceivedInstance = givenReceivedInstance.toJSON();
          givenReceivedInstance.actualOrPlanned =
            getActualOrPlannedStringFromNumber(
              givenReceivedInstance.actualOrPlanned
            );
          givenReceivedInstance.givenOrReceived =
            getGivenOrReceivedStringFromNumber(
              givenReceivedInstance.givenOrReceived
            );
          givenReceivedInstance.amount = Number(givenReceivedInstance.amount);
          givenReceivedInstance.remainingAmount = Number(
            givenReceivedInstance.remainingAmount
          );

          res.json({
            message: "Given received instance saved",
            givenReceivedInstance: givenReceivedInstance,
          });
        });
      }
    );
  }

  apiRouter
    .route("/given-received/:givenReceivedInstanceId*?")
    .get(function (req, res) {
      var id = req.params.givenReceivedInstanceId;
      if (id == null) {
        var startDate = req.query.startdate;
        var endDate = req.query.enddate;
        if (startDate == null || endDate == null) {
          res.status(400);
          res.send({
            message:
              "Please send given received instance id or startdate and enddate query parameters",
          });
          return;
        }
      }

      findItemsForThisAccount(req, res, function (account) {
        if (id) {
          GivenReceivedInstance.findOne(
            {
              accountId: account.id,
              _id: new ObjectId(id),
            },
            function (err, givenReceivedInstance) {
              if (err) {
                res.send(err);
                return;
              }
              givenReceivedInstance = givenReceivedInstance.toJSON();
              givenReceivedInstance.actualOrPlanned =
                getActualOrPlannedStringFromNumber(
                  givenReceivedInstance.actualOrPlanned
                );
              givenReceivedInstance.givenOrReceived =
                getGivenOrReceivedStringFromNumber(
                  givenReceivedInstance.givenOrReceived
                );
              givenReceivedInstance.amount = Number(
                givenReceivedInstance.amount
              );
              givenReceivedInstance.remainingAmount = Number(
                givenReceivedInstance.remainingAmount
              );
              res.json(givenReceivedInstance);
            }
          );
        } else {
          startDate = Number(startDate);
          endDate = Number(endDate);
          GivenReceivedInstance.find(
            {
              accountId: account.id,
              date: { $gte: startDate, $lte: endDate },
            },
            function (err, givenReceivedInstances) {
              if (err) {
                res.send(err);
                return;
              }

              var actual = getActualOrPlannedNumberFromString("actual");
              var givenReceivedActuals = _.filter(
                givenReceivedInstances,
                function (gr) {
                  return gr.actualOrPlanned === actual;
                }
              );

              var planned = getActualOrPlannedNumberFromString("plan");
              var given = getGivenOrReceivedNumberFromString("given");
              var received = getGivenOrReceivedNumberFromString("received");
              var givenPlans = _.filter(givenReceivedInstances, function (gr) {
                return (
                  gr.actualOrPlanned === planned && gr.givenOrReceived === given
                );
              });
              var receivedPlans = _.filter(
                givenReceivedInstances,
                function (gr) {
                  return (
                    gr.actualOrPlanned === planned &&
                    gr.givenOrReceived === received
                  );
                }
              );

              var result = {
                toBeReceivedAmount: _.reduce(
                  _.map(receivedPlans, function (r) {
                    return Number(r.amount);
                  }),
                  function (memo, num) {
                    return memo + num;
                  },
                  0
                ),
                receivedFromOthersInstances: [],
                toBeGivenAmount: _.reduce(
                  _.map(givenPlans, function (r) {
                    return Number(r.amount);
                  }),
                  function (memo, num) {
                    return memo + num;
                  },
                  0
                ),
                givenToOthersInstances: [],
              };
              for (
                var i = 0, givenReceivedActual;
                (givenReceivedActual = givenReceivedActuals[i]);
                i++
              ) {
                givenReceivedActual = givenReceivedActual.toJSON();
                givenReceivedActual.actualOrPlanned = "actual";
                givenReceivedActual.givenOrReceived =
                  getGivenOrReceivedStringFromNumber(
                    givenReceivedActual.givenOrReceived
                  );
                givenReceivedActual.amount = Number(givenReceivedActual.amount);
                givenReceivedActual.remainingAmount = Number(
                  givenReceivedActual.remainingAmount
                );

                if (givenReceivedActual.givenOrReceived === "given") {
                  result.givenToOthersInstances.push(givenReceivedActual);
                  result.toBeGivenAmount -= givenReceivedActual.amount;
                } else if (givenReceivedActual.givenOrReceived === "received") {
                  result.receivedFromOthersInstances.push(givenReceivedActual);
                  result.toBeReceivedAmount -= givenReceivedActual.amount;
                }
              }
              res.json(result);
            }
          );
        }
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var toWhom = req.body.toWhom || "";
        createContactIfNotExist(
          toWhom._id,
          account,
          toWhom.firstName,
          toWhom.lastName,
          "",
          "",
          "",
          req,
          res,
          createOrUpdateGivenReceivedInstance
        );
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var toWhom = req.body.toWhom || "";
        createContactIfNotExist(
          toWhom._id,
          account,
          toWhom.firstName,
          toWhom.lastName,
          "",
          "",
          "",
          req,
          res,
          createOrUpdateGivenReceivedInstance
        );
      });
    })
    .delete(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.givenReceivedInstanceId;
        GivenReceivedInstance.findOne(
          { _id: new ObjectId(id) },
          function (err, givenReceivedInstance) {
            if (err || givenReceivedInstance == null) {
              console.log(err);
              res.status(404).json({
                message: "Given received instance not found with id " + id,
              });
            } else if (givenReceivedInstance.accountId != account.id) {
              res.status(403).json({
                message:
                  "Given received instance does not belong to account " +
                  account.username,
              });
            } else {
              givenReceivedInstance.remove(function (err) {
                if (err) {
                  console.log(err);
                  res
                    .status(500)
                    .json({ message: "Something has gone wrong!" });
                }

                givenReceivedInstance = givenReceivedInstance.toJSON();
                givenReceivedInstance.actualOrPlanned =
                  getActualOrPlannedStringFromNumber(
                    givenReceivedInstance.actualOrPlanned
                  );
                givenReceivedInstance.givenOrReceived =
                  getGivenOrReceivedStringFromNumber(
                    givenReceivedInstance.givenOrReceived
                  );
                givenReceivedInstance.amount = Number(
                  givenReceivedInstance.amount
                );
                givenReceivedInstance.remainingAmount = Number(
                  givenReceivedInstance.remainingAmount
                );

                res.json({
                  message: "Given received instance deleted",
                  givenReceivedInstance: givenReceivedInstance,
                });
              });
            }
          }
        );
      });
    });

  apiRouter
    .route("/given-received-plans/")
    .get(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var startMonth = Number(req.query.startmonth);
        var endMonth = Number(req.query.endmonth);
        var givenOrReceived = req.query.givenOrReceived;
        var contactId = req.query.contactId;
        if (startMonth && endMonth) {
          var startMonthDate = getDateFromMonthString(startMonth);
          var endMonthDate = getDateFromMonthString(endMonth, "end");

          var result = {
            receivedFromOthersPlans: [],
            givenToOthersPlans: [],
          };

          UserSettings.findOne(
            {
              accountId: account.id,
            },
            function (error, userSettings) {
              for (
                var d = new Date(startMonthDate);
                d <= endMonthDate;
                d.setMonth(d.getMonth() + 1)
              ) {
                result.givenToOthersPlans.push({
                  accountId: account.id,
                  month: getMonthStringFromDate(d),
                  lineitems: [],
                });
                result.receivedFromOthersPlans.push({
                  accountId: account.id,
                  month: getMonthStringFromDate(d),
                  lineitems: [],
                });
              }

              GivenReceivedInstance.find(
                {
                  accountId: account.id,
                  date: {
                    $gte: parseInt(getStringFromDate(startMonthDate)),
                    $lte: parseInt(getStringFromDate(endMonthDate)),
                  },
                  actualOrPlanned: getActualOrPlannedNumberFromString("plan"),
                },
                function (err, givenReceivedPlans) {
                  if (err) {
                    res.send(err);
                    return;
                  }

                  givenReceivedPlans.forEach(function (givenReceivedPlan) {
                    givenReceivedPlan = givenReceivedPlan.toJSON();
                    givenReceivedPlan.month = getMonthStringFromDateString(
                      givenReceivedPlan.date
                    );
                    if (givenReceivedPlan.givenOrReceived == 0) {
                      for (
                        var j = 0, gtop;
                        (gtop = result.givenToOthersPlans[j]);
                        j++
                      ) {
                        if (
                          gtop.month ==
                          getMonthStringFromDateString(givenReceivedPlan.date)
                        ) {
                          result.givenToOthersPlans[j].lineitems.push({
                            _id: givenReceivedPlan._id,
                            currency: givenReceivedPlan.currency,
                            amount: Number(givenReceivedPlan.amount),
                            date: givenReceivedPlan.date,
                            toWhom: givenReceivedPlan.toWhom,
                            comment: givenReceivedPlan.comment,
                            tags: givenReceivedPlan.tags,
                          });
                        }
                      }
                    } else {
                      for (
                        var j = 0, rfop;
                        (rfop = result.receivedFromOthersPlans[j]);
                        j++
                      ) {
                        if (
                          rfop.month ==
                          getMonthStringFromDateString(givenReceivedPlan.date)
                        ) {
                          result.receivedFromOthersPlans[j].lineitems.push({
                            _id: givenReceivedPlan._id,
                            currency: givenReceivedPlan.currency,
                            amount: Number(givenReceivedPlan.amount),
                            date: givenReceivedPlan.date,
                            toWhom: givenReceivedPlan.toWhom,
                            comment: givenReceivedPlan.comment,
                            tags: givenReceivedPlan.tags,
                          });
                        }
                      }
                    }
                  });
                  res.json(result);
                }
              );
            }
          );
        } else if (givenOrReceived) {
          GivenReceivedInstance.find(
            {
              accountId: account.id,
              givenOrReceived: givenOrReceived,
              actualOrPlanned: getActualOrPlannedNumberFromString("plan"),
              isResolved: false,
            },
            function (err, givenReceivedPlans) {
              if (err) {
                res.send(err);
                return;
              }

              result = [];
              givenReceivedPlans.forEach(function (gr) {
                gr = gr.toJSON();
                gr.actualOrPlanned = getActualOrPlannedStringFromNumber(
                  gr.actualOrPlanned
                );
                gr.givenOrReceived = getGivenOrReceivedStringFromNumber(
                  gr.givenOrReceived
                );

                var grResult = {
                  _id: gr._id,
                  actualOrPlanned: gr.actualOrPlanned,
                  givenOrReceived: gr.givenOrReceived,
                  currency: gr.currency,
                  amount: Number(gr.amount),
                  remainingAmount: Number(gr.remainingAmount),
                  date: gr.date,
                  toWhom: gr.toWhom,
                  comment: gr.comment,
                  tags: gr.tags,
                  isResolved: gr.isResolved,
                };
                result.push(grResult);
              });
              res.json(result);
            }
          );
        } else if (contactId) {
          Contact.findOne(
            {
              accountId: account.id,
              _id: new ObjectId(contactId),
            },
            function (error, contact) {
              GivenReceivedInstance.find(
                {
                  accountId: account.id,
                  "toWhom._id": new ObjectId(contact.id),
                },
                function (err, givenReceived) {
                  if (err) {
                    res.send(err);
                    return;
                  }

                  var result = {
                    toBeGiven: [],
                    toBeReceived: [],
                    alreadyGiven: [],
                    alreadyReceived: [],
                  };

                  givenReceived.forEach(function (gr) {
                    gr = gr.toJSON();
                    gr.actualOrPlanned = getActualOrPlannedStringFromNumber(
                      gr.actualOrPlanned
                    );
                    gr.givenOrReceived = getGivenOrReceivedStringFromNumber(
                      gr.givenOrReceived
                    );

                    var grResult = {
                      _id: gr._id,
                      actualOrPlanned: gr.actualOrPlanned,
                      givenOrReceived: gr.givenOrReceived,
                      currency: gr.currency,
                      amount: Number(gr.amount),
                      remainingAmount: Number(gr.remainingAmount),
                      date: gr.date,
                      toWhom: gr.toWhom,
                      comment: gr.comment,
                      tags: gr.tags,
                      isResolved: gr.isResolved,
                    };

                    if (
                      grResult.givenOrReceived === "given" &&
                      grResult.actualOrPlanned === "planned"
                    ) {
                      result.toBeGiven.push(grResult);
                    } else if (
                      grResult.givenOrReceived === "received" &&
                      grResult.actualOrPlanned === "planned"
                    ) {
                      result.toBeReceived.push(grResult);
                    } else if (
                      grResult.givenOrReceived === "given" &&
                      grResult.actualOrPlanned === "actual"
                    ) {
                      result.alreadyGiven.push(grResult);
                    } else if (
                      grResult.givenOrReceived === "received" &&
                      grResult.actualOrPlanned === "actual"
                    ) {
                      result.alreadyReceived.push(grResult);
                    }
                  });
                  res.json(result);
                }
              );
            }
          );
        } else {
          res.status(400);
          res.send({
            message:
              "Please send startmonth, endmonth or givenOrReceived query parameters",
          });
          return;
        }
      });
    })
    .post(function (req, res) {
      if (req.body.month == null) {
        res
          .status(412)
          .json({ message: "Please specify month for given received plan" });
        return;
      }

      var startMonth = Number(req.body.month);
      var endMonth = Number(req.body.month);
      var startMonthDate = getDateFromMonthString(startMonth);
      var endMonthDate = getDateFromMonthString(endMonth, "end");

      findItemsForThisAccount(req, res, function (account) {
        GivenReceivedInstance.remove(
          {
            accountId: account.id,
            date: {
              $gte: parseInt(getStringFromDate(startMonthDate)),
              $lte: parseInt(getStringFromDate(endMonthDate)),
            },
            actualOrPlanned: getActualOrPlannedNumberFromString("plan"),
            givenOrReceived: getGivenOrReceivedNumberFromString(
              req.body.givenOrReceived || "given"
            ),
          },
          function (err) {
            if (err) {
              console.log(err);
              res.status(404).json({
                message:
                  "Error deleting existing given received plans for month " +
                  startMonth,
              });
              return;
            }

            var givenReceivedPlanForMonth = {
              accountId: account.id,
              month: startMonth,
              lineitems: [],
              actualOrPlanned: "plan",
              givenOrReceived: req.body.givenOrReceived || "given",
            };

            var lineitems = req.body.lineitems;

            var validLineItemsCount = 0;
            var saved = 0;

            function createGivenReceivedPlan(req, res, account, contact, data) {
              var givenReceivedPlan = new GivenReceivedInstance();
              givenReceivedPlan.accountId = account.id;
              givenReceivedPlan.currency = data.currency;
              givenReceivedPlan.amount = Number(data.amount);
              givenReceivedPlan.date = data.date;
              givenReceivedPlan.toWhom = contact;
              givenReceivedPlan.comment = data.comment;
              givenReceivedPlan.tags = data.tags;
              givenReceivedPlan.actualOrPlanned =
                getActualOrPlannedNumberFromString("plan");
              givenReceivedPlan.givenOrReceived =
                getGivenOrReceivedNumberFromString(
                  givenReceivedPlanForMonth.givenOrReceived
                );
              givenReceivedPlan.isResolved = false;
              givenReceivedPlan.remainingAmount = Number(data.amount);

              console.log(
                "Creating given received plan: " +
                  JSON.stringify(givenReceivedPlan)
              );
              givenReceivedPlan.save(function (err, grp) {
                if (err) {
                  console.log(err);
                  res
                    .status(500)
                    .json({ message: "Something has gone wrong!" });
                }

                console.log(
                  "Given received plan created: " + JSON.stringify(grp)
                );
                grp = grp.toJSON();
                delete grp.actualOrPlanned;
                delete grp.givenOrReceived;
                grp.amount = Number(grp.amount);
                givenReceivedPlanForMonth.lineitems.push(grp);
                saved++;
                if (saved === validLineItemsCount) {
                  res.json({
                    message: "Given Received plan updated",
                    givenReceivedPlan: givenReceivedPlanForMonth,
                  });
                }
              });
            }

            for (var i = 0, li; (li = lineitems[i]); i++) {
              if (li.toWhom === "") {
                continue;
              }

              validLineItemsCount++;
              var givenReceivedPlanData = {};
              givenReceivedPlanData.currency = li.currency;
              givenReceivedPlanData.amount = li.amount;
              givenReceivedPlanData.date = li.date;
              givenReceivedPlanData.toWhom = li.toWhom;
              givenReceivedPlanData.comment = li.comment;
              givenReceivedPlanData.tags = li.tags;
              givenReceivedPlanData.remainingAmount = li.amount;

              createContactIfNotExist(
                li.toWhom._id,
                account,
                li.toWhom.firstName,
                li.toWhom.lastName,
                "",
                "",
                "",
                req,
                res,
                createGivenReceivedPlan,
                givenReceivedPlanData
              );
            }

            if (validLineItemsCount === 0) {
              res.json({
                message: "Given Received plan updated as empty",
                givenReceivedPlan: givenReceivedPlanForMonth,
              });
            }
          }
        );
      });
    });

  apiRouter
    .route("/banks/:bankId*?")
    .get(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.bankId;
        if (id) {
          Bank.findOne(
            {
              accountId: account.id,
              _id: new ObjectId(id),
            },
            function (err, bank) {
              if (err) {
                res.send(err);
                return;
              }
              var result = bank.toJSON();
              result.balance = Number(bank.balance);
              res.json(result);
            }
          );
        } else {
          Bank.find(
            {
              accountId: account.id,
            },
            function (err, banks) {
              if (err) {
                res.send(err);
                return;
              }
              var result = [];
              banks.forEach(function (bank) {
                bank = bank.toJSON();
                bank.balance = Number(bank.balance);
                result.push(bank);
              });
              res.json(result);
            }
          );
        }
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var bankName = req.body.bankName;
        var accountType = req.body.accountType;
        var accountNumber = req.body.accountNumber;
        var details = req.body.details;
        var order = req.body.order;
        var currency = req.body.currency;
        if (
          bankName == null ||
          accountType == null ||
          accountNumber == null ||
          order == null ||
          currency == null
        ) {
          res.status(412).json({
            message:
              "Please specify bank name, account type, account number, order and currency",
          });
          return;
        }
        var bank = new Bank();
        bank.bankName = bankName;
        bank.accountType = accountType;
        bank.accountNumber = accountNumber;
        bank.details = details;
        bank.order = order;
        bank.accountId = account.id;
        bank.currency = currency;
        bank.balance = 0;
        bank.save(function (err) {
          if (err) {
            console.log(err);
            res.status(500).json({ message: "Something has gone wrong!" });
          }

          bank = bank.toJSON();
          bank.balance = Number(bank.balance);
          res.json({ message: "Bank account added", bank: bank });
        });
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.bankId;
        var bankName = req.body.bankName;
        var accountType = req.body.accountType;
        var accountNumber = req.body.accountNumber;
        var details = req.body.details;
        if (bankName == null || accountType == null || accountNumber == null) {
          res.status(412).json({
            success: false,
            message:
              "Please specify bank name, account type and account number",
          });
          return;
        }

        Bank.findOne(
          {
            accountId: account.id,
            _id: new ObjectId(id),
          },
          function (err, bank) {
            if (err) {
              res.send(err);
              return;
            }

            bank.bankName = bankName;
            bank.accountType = accountType;
            bank.accountNumber = accountNumber;
            bank.details = details;
            bank.save(function (err) {
              if (err) {
                console.log(err);
                res.status(500).json({
                  success: false,
                  message: "Something has gone wrong!",
                });
              }

              bank = bank.toJSON();
              bank.balance = Number(bank.balance);
              res.json({
                success: true,
                message: "Bank account updated",
                bank: bank,
              });
            });
          }
        );
      });
    })
    .delete(function (req, res) {
      var bankId = req.params.bankId;
      findItemsForThisAccount(req, res, function (account) {
        Bank.remove(
          {
            _id: new ObjectId(bankId),
            accountId: account.id,
          },
          function (err) {
            if (err) {
              console.log(err);
              res
                .status(500)
                .json({ message: "Something has gone wrong!", success: false });
            }
            res.json({ success: true, message: "Bank deleted" });
          }
        );
      });
    });

  apiRouter
    .route("/bank-transactions")
    .get(function (req, res) {
      var startDate = req.query.startdate;
      var endDate = req.query.enddate;
      var bankId = req.query.bankId;
      if (startDate == null || endDate == null) {
        res.status(400);
        res.send({
          message: "Please send startdate and enddate query parameters",
        });
        return;
      }

      findItemsForThisAccount(req, res, function (account) {
        startDate = Number(startDate);
        endDate = Number(endDate);
        var query = {
          accountId: account.id,
          date: { $gte: startDate, $lte: endDate },
        };

        if (bankId) {
          query["bankId"] = new ObjectId(bankId);
        }
        BankTransaction.find(query, function (err, bankTransactions) {
          if (err) {
            res.send(err);
            return;
          }

          var result = [];
          if (bankTransactions) {
            bankTransactions.forEach(function (t) {
              t = t.toJSON();
              t.transactionType = getTransactionTypeStringFromNumber(
                t.transactionType
              );
              t.amount = Number(t.amount);
              t.balance = Number(t.balance);
              result.push(t);
            });
          }

          res.json(result);
        });
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var date = req.body.date;
        var bankId = req.body.bankId;
        var currency = req.body.currency;

        if (date == null) {
          res.status(412).json({
            message: "Please specify new date for Given received instance",
          });
        }

        if (bankId == null) {
          res.status(412).json({ message: "Please specify bank id" });
        }

        BankTransaction.remove(
          {
            accountId: account.id,
            date: date,
            bankId: new ObjectId(bankId),
          },
          function (removeError) {
            if (removeError) {
              console.log(removeError);
              res.status(500).json({ message: "Something has gone wrong!" });
            }

            var promisesToAddTransactions = [];
            var result = {
              date: Number(date),
              currency: currency,
              bankId: bankId,
              transactions: [],
            };

            var transactionsInReq = req.body.transactions;
            transactionsInReq.forEach(function (t) {
              var trans = new BankTransaction();
              trans.accountId = account.id;
              trans.bankId = bankId;
              trans.amount = t.amount;
              trans.balance = 0;
              trans.date = date;
              trans.remark = t.remark;
              trans.transactionType = getTransactionTypeNumberFromString(
                t.transactionType || "debit"
              ); // 0 - debit, 1 - credit, 2 - balance carry forward
              trans.order = t.order;

              result.transactions.push(trans);
              promisesToAddTransactions.push(trans.save());
            });

            Promise.all(promisesToAddTransactions).then(function () {
              //get all transactiosn for this account and update balance from startdate onwards
              BankTransaction.find(
                {
                  accountId: account.id,
                  bankId: new ObjectId(bankId),
                },
                function (err, allTransactions) {
                  if (err) {
                    res.send(err);
                    return;
                  }

                  allTransactions = _.sortBy(allTransactions, function (t) {
                    return t.date;
                  });

                  var promisesToUpdateBalance = [];
                  var balance = 0;
                  for (var i = 0, tran; (tran = allTransactions[i]); i++) {
                    if (tran.date < date) {
                      balance = Number(tran.balance);
                      continue;
                    }

                    var transactionAmount = Number(tran.amount);
                    switch (tran.transactionType) {
                      case 0: // debit
                        balance -= transactionAmount;
                        break;
                      case 1: // credit
                        balance += transactionAmount;
                        break;
                      case 2: // balance carry forward
                        balance = transactionAmount;
                        break;
                    }
                    tran.balance = balance;
                    promisesToUpdateBalance.push(tran.save());
                  }

                  Bank.findOne(
                    {
                      accountId: account.id,
                      _id: new ObjectId(bankId),
                    },
                    function (bankError, bank) {
                      if (bankError) {
                        console.log(bankError);
                        res
                          .status(500)
                          .json({ message: "Something has gone wrong!" });
                      }

                      bank.balance = balance;
                      promisesToUpdateBalance.push(bank.save());
                    }
                  );

                  Promise.all(promisesToUpdateBalance).then(function () {
                    BankTransaction.find(
                      {
                        accountId: account.id,
                        date: date,
                        bankId: new ObjectId(bankId),
                      },
                      function (err, bankTransactions) {
                        if (err) {
                          res.send(err);
                          return;
                        }

                        var updatedTransactions = [];
                        bankTransactions.forEach(function (t) {
                          t = t.toJSON();
                          t.transactionType =
                            getTransactionTypeStringFromNumber(
                              t.transactionType
                            );
                          t.amount = Number(t.amount);
                          t.balance = Number(t.balance);
                          updatedTransactions.push(t);
                        });
                        result.transactions = updatedTransactions;

                        res.json({
                          message: "Bank Transactions updated",
                          bankTransactions: result,
                        });
                      }
                    );
                  });
                }
              );
            });
          }
        );
      });
    });

  apiRouter
    .route("/investments/:investmentId*?")
    .get(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.investmentId;
        if (id) {
          Investment.findOne(
            {
              accountId: account.id,
              _id: new ObjectId(id),
            },
            function (err, investment) {
              if (err) {
                res.send(err);
                return;
              }
              var result = investment.toJSON();
              result.currentValue = Number(investment.currentValue);
              res.json(result);
            }
          );
        } else {
          Investment.find(
            {
              accountId: account.id,
            },
            function (err, investments) {
              if (err) {
                res.send(err);
                return;
              }
              var result = [];
              investments.forEach(function (investment) {
                investment = investment.toJSON();
                investment.currentValue = Number(investment.currentValue);
                result.push(investment);
              });
              res.json(result);
            }
          );
        }
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var investmentName = req.body.investmentName;
        var accountType = req.body.accountType;
        var accountNumber = req.body.accountNumber;
        var details = req.body.details;
        var order = req.body.order;
        var currency = req.body.currency;
        if (
          investmentName == null ||
          accountType == null ||
          order == null ||
          currency == null
        ) {
          res.status(412).json({
            message:
              "Please specify investment name, investment type, order and currency",
          });
          return;
        }
        var investment = new Investment();
        investment.investmentName = investmentName;
        investment.accountType = accountType;
        investment.accountNumber = accountNumber;
        investment.details = details;
        investment.order = order;
        investment.accountId = account.id;
        investment.currency = currency;
        investment.currentValue = 0;
        investment.save(function (err) {
          if (err) {
            console.log(err);
            res.status(500).json({ message: "Something has gone wrong!" });
          }

          investment = investment.toJSON();
          investment.currentValue = Number(investment.currentValue);
          res.json({
            message: "Investment account added",
            investment: investment,
          });
        });
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.investmentId;
        var investmentName = req.body.investmentName;
        var accountNumber = req.body.accountNumber;
        var details = req.body.details;
        if (investmentName == null) {
          res.status(412).json({ message: "Please specify investment name" });
          return;
        }

        Investment.findOne(
          {
            accountId: account.id,
            _id: new ObjectId(id),
          },
          function (err, investment) {
            if (err) {
              res.send(err);
              return;
            }

            investment.investmentName = investmentName;
            investment.accountNumber = accountNumber;
            investment.details = details;
            investment.save(function (err) {
              if (err) {
                console.log(err);
                res.status(500).json({
                  success: false,
                  message: "Something has gone wrong!",
                });
              }

              investment = investment.toJSON();
              investment.currentValue = Number(investment.currentValue);
              res.json({
                success: true,
                message: "Investment account updated",
                investment: investment,
              });
            });
          }
        );
      });
    })
    .delete(function (req, res) {
      var investmentId = req.params.investmentId;
      findItemsForThisAccount(req, res, function (account) {
        Investment.remove(
          {
            _id: new ObjectId(investmentId),
            accountId: account.id,
          },
          function (err) {
            if (err) {
              console.log(err);
              res
                .status(500)
                .json({ message: "Something has gone wrong!", success: false });
            }
            res.json({ success: true, message: "Investment deleted" });
          }
        );
      });
    });

  apiRouter
    .route("/investment-transactions")
    .get(function (req, res) {
      var startDate = req.query.startdate;
      var endDate = req.query.enddate;
      var investmentId = req.query.investmentId;
      if (startDate == null || endDate == null) {
        res.status(400);
        res.send({
          message: "Please send startdate and enddate query parameters",
        });
        return;
      }

      findItemsForThisAccount(req, res, function (account) {
        startDate = Number(startDate);
        endDate = Number(endDate);
        var query = {
          accountId: account.id,
          date: { $gte: startDate, $lte: endDate },
        };
        if (investmentId) {
          query["investmentId"] = new ObjectId(investmentId);
        }

        InvestmentTransaction.find(
          query,
          function (err, investmentTransactions) {
            if (err) {
              res.send(err);
              return;
            }

            var result = [];
            investmentTransactions.forEach(function (t) {
              t = t.toJSON();
              t.transactionType = getInvestmentTransactionTypeStringFromNumber(
                t.transactionType
              );
              t.amount = Number(t.amount);
              t.currentValue = Number(t.currentValue);
              result.push(t);
            });

            res.json(result);
          }
        );
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var date = req.body.date;
        var investmentId = req.body.investmentId;
        var currency = req.body.currency;

        if (date == null) {
          res.status(412).json({
            message: "Please specify new date for Given received instance",
          });
        }

        if (investmentId == null) {
          res.status(412).json({ message: "Please specify investment id" });
        }

        InvestmentTransaction.remove(
          {
            accountId: account.id,
            date: date,
            investmentId: new ObjectId(investmentId),
          },
          function (removeError) {
            if (removeError) {
              console.log(removeError);
              res.status(500).json({ message: "Something has gone wrong!" });
            }

            var promisesToAddTransactions = [];
            var result = {
              date: Number(date),
              currency: currency,
              investmentId: investmentId,
              transactions: [],
            };

            var transactionsInReq = req.body.transactions;
            transactionsInReq.forEach(function (t) {
              var trans = new InvestmentTransaction();
              trans.accountId = account.id;
              trans.investmentId = investmentId;
              trans.amount = t.amount;
              trans.currentValue = 0;
              trans.date = date;
              trans.remark = t.remark;
              trans.transactionType =
                getInvestmentTransactionTypeNumberFromString(
                  t.transactionType || "buy"
                ); // 0 - buy, 1 - sell, 2 - current-value
              trans.order = t.order;

              result.transactions.push(trans);
              promisesToAddTransactions.push(trans.save());
            });

            Promise.all(promisesToAddTransactions).then(function () {
              //get all transactiosn for this account and update currentValue from startdate onwards
              InvestmentTransaction.find(
                {
                  accountId: account.id,
                  investmentId: new ObjectId(investmentId),
                },
                function (err, allTransactions) {
                  if (err) {
                    res.send(err);
                    return;
                  }

                  allTransactions = _.sortBy(allTransactions, function (t) {
                    return t.date;
                  });

                  var promisesToUpdateBalance = [];
                  var currentValue = 0;
                  for (var i = 0, tran; (tran = allTransactions[i]); i++) {
                    if (tran.date < date) {
                      currentValue = Number(tran.currentValue);
                      continue;
                    }

                    var transactionAmount = Number(tran.amount);
                    switch (tran.transactionType) {
                      case 0: // buy
                        currentValue += transactionAmount;
                        break;
                      case 1: // sell
                        currentValue -= transactionAmount;
                        break;
                      case 2: // current value
                        currentValue = transactionAmount;
                        break;
                    }
                    tran.currentValue = currentValue;
                    promisesToUpdateBalance.push(tran.save());
                  }

                  Investment.findOne(
                    {
                      accountId: account.id,
                      _id: new ObjectId(investmentId),
                    },
                    function (investmentError, investment) {
                      if (investmentError) {
                        console.log(investmentError);
                        res
                          .status(500)
                          .json({ message: "Something has gone wrong!" });
                      }

                      investment.currentValue = currentValue;
                      promisesToUpdateBalance.push(investment.save());
                    }
                  );

                  Promise.all(promisesToUpdateBalance).then(function () {
                    InvestmentTransaction.find(
                      {
                        accountId: account.id,
                        date: date,
                        investmentId: new ObjectId(investmentId),
                      },
                      function (err, investmentTransactions) {
                        if (err) {
                          res.send(err);
                          return;
                        }

                        var updatedTransactions = [];
                        investmentTransactions.forEach(function (t) {
                          t = t.toJSON();
                          t.transactionType =
                            getInvestmentTransactionTypeStringFromNumber(
                              t.transactionType
                            );
                          t.amount = Number(t.amount);
                          t.currentValue = Number(t.currentValue);
                          updatedTransactions.push(t);
                        });
                        result.transactions = updatedTransactions;

                        res.json({
                          message: "Investment Transactions updated",
                          investmentTransactions: result,
                        });
                      }
                    );
                  });
                }
              );
            });
          }
        );
      });
    });

  apiRouter
    .route("/credit-cards/:creditCardId*?")
    .get(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.creditCardId;
        if (id) {
          CreditCard.findOne(
            {
              accountId: account.id,
              _id: new ObjectId(id),
            },
            function (err, creditCard) {
              if (err) {
                res.send(err);
                return;
              }
              var result = creditCard.toJSON();
              var outstandingBalance = Number(creditCard.outstandingBalance);
              var creditLimit = Number(creditCard.creditLimit);
              result.outstandingBalance = outstandingBalance;
              result.creditLimit = creditLimit;
              result.availableCreditLimit =
                outstandingBalance > creditLimit
                  ? 0
                  : creditLimit - outstandingBalance;
              res.json(result);
            }
          );
        } else {
          CreditCard.find(
            {
              accountId: account.id,
            },
            function (err, creditCards) {
              if (err) {
                res.send(err);
                return;
              }
              var result = [];
              creditCards.forEach(function (creditCard) {
                creditCard = creditCard.toJSON();
                var outstandingBalance = Number(creditCard.outstandingBalance);
                var creditLimit = Number(creditCard.creditLimit);
                creditCard.outstandingBalance = outstandingBalance;
                creditCard.creditLimit = creditLimit;
                creditCard.availableCreditLimit =
                  outstandingBalance > creditLimit
                    ? 0
                    : creditLimit - outstandingBalance;
                result.push(creditCard);
              });
              res.json(result);
            }
          );
        }
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var name = req.body.name;
        var cardNumber = req.body.cardNumber;
        var details = req.body.details;
        var order = req.body.order;
        var currency = req.body.currency;
        var creditLimit = req.body.creditLimit;
        if (
          name == null ||
          cardNumber == null ||
          creditLimit == null ||
          order == null ||
          currency == null
        ) {
          res.status(412).json({
            message:
              "Please specify credit card name, card number, credit limit, order and currency",
          });
          return;
        }
        var creditCard = new CreditCard();
        creditCard.name = name;
        creditCard.cardNumber = cardNumber;
        creditCard.details = details;
        creditCard.order = order;
        creditCard.accountId = account.id;
        creditCard.currency = currency;
        creditCard.outstandingBalance = 0;
        creditCard.creditLimit = creditLimit;
        creditCard.save(function (err) {
          if (err) {
            console.log(err);
            res.status(500).json({ message: "Something has gone wrong!" });
          }

          creditCard = creditCard.toJSON();
          var outstandingBalance = Number(creditCard.outstandingBalance);
          creditCard.outstandingBalance = outstandingBalance;
          var creditLimitValue = Number(creditCard.creditLimit);
          creditCard.creditLimit = creditLimitValue;
          creditCard.availableCreditLimit =
            outstandingBalance > creditLimitValue
              ? 0
              : creditLimitValue - outstandingBalance;
          res.json({
            message: "CreditCard account added",
            creditCard: creditCard,
          });
        });
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.creditCardId;
        var name = req.body.name;
        var cardNumber = req.body.cardNumber;
        var details = req.body.details;
        var creditLimit = req.body.creditLimit;
        if (name == null || cardNumber == null || creditLimit == null) {
          res.status(412).json({
            success: false,
            message:
              "Please specify credit card name, card number and credit limit",
          });
          return;
        }

        CreditCard.findOne(
          {
            accountId: account.id,
            _id: new ObjectId(id),
          },
          function (err, creditCard) {
            if (err) {
              res.send(err);
              return;
            }

            creditCard.name = name;
            creditCard.cardNumber = cardNumber;
            creditCard.details = details;
            creditCard.creditLimit = creditLimit;
            creditCard.save(function (err) {
              if (err) {
                console.log(err);
                res.status(500).json({
                  success: false,
                  message: "Something has gone wrong!",
                });
              }

              creditCard = creditCard.toJSON();
              var outstandingBalance = Number(creditCard.outstandingBalance);
              creditCard.outstandingBalance = outstandingBalance;
              var creditLimitValue = Number(creditCard.creditLimit);
              creditCard.creditLimit = creditLimitValue;
              creditCard.availableCreditLimit =
                outstandingBalance > creditLimitValue
                  ? 0
                  : creditLimitValue - outstandingBalance;
              res.json({
                success: true,
                message: "CreditCard account added",
                creditCard: creditCard,
              });
            });
          }
        );
      });
    })
    .delete(function (req, res) {
      var creditCardId = req.params.creditCardId;
      findItemsForThisAccount(req, res, function (account) {
        CreditCard.remove(
          {
            _id: new ObjectId(creditCardId),
            accountId: account.id,
          },
          function (err) {
            if (err) {
              console.log(err);
              res
                .status(500)
                .json({ message: "Something has gone wrong!", success: false });
            }
            res.json({ success: true, message: "CreditCard deleted" });
          }
        );
      });
    });

  apiRouter
    .route("/credit-card-transactions")
    .get(function (req, res) {
      var startDate = req.query.startdate;
      var endDate = req.query.enddate;
      var creditCardId = req.query.creditCardId;
      if (startDate == null || endDate == null) {
        res.status(400);
        res.send({
          message: "Please send startdate and enddate query parameters",
        });
        return;
      }

      findItemsForThisAccount(req, res, function (account) {
        startDate = Number(startDate);
        endDate = Number(endDate);
        var query = {
          accountId: account.id,
          date: { $gte: startDate, $lte: endDate },
        };
        if (creditCardId) {
          query["creditCardId"] = new ObjectId(creditCardId);
        }

        CreditCardTransaction.find(
          query,
          function (err, creditCardTransactions) {
            if (err) {
              res.send(err);
              return;
            }

            var result = [];
            creditCardTransactions.forEach(function (t) {
              t = t.toJSON();
              t.transactionType = getTransactionTypeStringFromNumber(
                t.transactionType
              );
              t.amount = Number(t.amount);
              t.outstandingBalance = Number(t.outstandingBalance);
              result.push(t);
            });

            res.json(result);
          }
        );
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var date = req.body.date;
        var creditCardId = req.body.creditCardId;
        var currency = req.body.currency;

        if (date == null) {
          res.status(412).json({
            message: "Please specify new date for Given received instance",
          });
        }

        if (creditCardId == null) {
          res.status(412).json({ message: "Please specify creditCard id" });
        }

        CreditCardTransaction.remove(
          {
            accountId: account.id,
            date: date,
            creditCardId: new ObjectId(creditCardId),
          },
          function (removeError) {
            if (removeError) {
              console.log(removeError);
              res.status(500).json({ message: "Something has gone wrong!" });
            }

            var promisesToAddTransactions = [];
            var result = {
              date: Number(date),
              currency: currency,
              creditCardId: creditCardId,
              transactions: [],
            };

            var transactionsInReq = req.body.transactions;
            transactionsInReq.forEach(function (t) {
              var trans = new CreditCardTransaction();
              trans.accountId = account.id;
              trans.creditCardId = creditCardId;
              trans.amount = t.amount;
              trans.outstandingBalance = 0;
              trans.date = date;
              trans.remark = t.remark;
              trans.transactionType = getTransactionTypeNumberFromString(
                t.transactionType || "debit"
              ); // 0 - debit, 1 - credit, 2 - balance carry forward
              trans.order = t.order;

              result.transactions.push(trans);
              promisesToAddTransactions.push(trans.save());
            });

            Promise.all(promisesToAddTransactions).then(function () {
              //get all transaction for this account and update balance from startdate onwards
              CreditCardTransaction.find(
                {
                  accountId: account.id,
                  creditCardId: new ObjectId(creditCardId),
                },
                function (err, allTransactions) {
                  if (err) {
                    res.send(err);
                    return;
                  }

                  allTransactions = _.sortBy(allTransactions, function (t) {
                    return t.date;
                  });

                  var promisesToUpdateBalance = [];
                  var outstandingBalance = 0;
                  for (var i = 0, tran; (tran = allTransactions[i]); i++) {
                    if (tran.date < date) {
                      outstandingBalance = Number(tran.outstandingBalance);
                      continue;
                    }

                    var transactionAmount = Number(tran.amount);
                    switch (tran.transactionType) {
                      case 0: // debit
                        outstandingBalance += transactionAmount;
                        break;
                      case 1: // credit
                        outstandingBalance -= transactionAmount;
                        break;
                      case 2: // outstandingBalance carry forward
                        outstandingBalance = transactionAmount;
                        break;
                    }
                    tran.outstandingBalance = outstandingBalance;
                    promisesToUpdateBalance.push(tran.save());
                  }

                  CreditCard.findOne(
                    {
                      accountId: account.id,
                      _id: new ObjectId(creditCardId),
                    },
                    function (creditCardError, creditCard) {
                      if (creditCardError) {
                        console.log(creditCardError);
                        res
                          .status(500)
                          .json({ message: "Something has gone wrong!" });
                      }

                      creditCard.outstandingBalance = outstandingBalance;
                      promisesToUpdateBalance.push(creditCard.save());
                    }
                  );

                  Promise.all(promisesToUpdateBalance).then(function () {
                    CreditCardTransaction.find(
                      {
                        accountId: account.id,
                        date: date,
                        creditCardId: new ObjectId(creditCardId),
                      },
                      function (err, creditCardTransactions) {
                        if (err) {
                          res.send(err);
                          return;
                        }

                        var updatedTransactions = [];
                        creditCardTransactions.forEach(function (t) {
                          t = t.toJSON();
                          t.transactionType =
                            getTransactionTypeStringFromNumber(
                              t.transactionType
                            );
                          t.amount = Number(t.amount);
                          t.outstandingBalance = Number(t.outstandingBalance);
                          updatedTransactions.push(t);
                        });
                        result.transactions = updatedTransactions;

                        res.json({
                          message: "CreditCard Transactions updated",
                          creditCardTransactions: result,
                        });
                      }
                    );
                  });
                }
              );
            });
          }
        );
      });
    });

  apiRouter
    .route("/loans/:loanId*?")
    .get(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.loanId;
        if (id) {
          Loan.findOne(
            {
              accountId: account.id,
              _id: new ObjectId(id),
            },
            function (err, loan) {
              if (err) {
                res.send(err);
                return;
              }
              var result = loan.toJSON();
              result.outstandingPrincipal = Number(loan.outstandingPrincipal);
              result.paidTillNow = Number(loan.paidTillNow);
              result.loanAmount = Number(loan.loanAmount);
              res.json(result);
            }
          );
        } else {
          Loan.find(
            {
              accountId: account.id,
            },
            function (err, loans) {
              if (err) {
                res.send(err);
                return;
              }
              var result = [];
              loans.forEach(function (loan) {
                loan = loan.toJSON();
                loan.outstandingPrincipal = Number(loan.outstandingPrincipal);
                loan.paidTillNow = Number(loan.paidTillNow);
                loan.loanAmount = Number(loan.loanAmount);
                result.push(loan);
              });
              res.json(result);
            }
          );
        }
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var name = req.body.name;
        var accountType = req.body.accountType;
        var accountNumber = req.body.accountNumber;
        var details = req.body.details;
        var order = req.body.order;
        var currency = req.body.currency;
        var loanAmount = req.body.loanAmount;
        if (
          name == null ||
          accountType == null ||
          accountNumber == null ||
          loanAmount == null ||
          order == null ||
          currency == null
        ) {
          res.status(412).json({
            message:
              "Please specify loan name, account type, loan amount, account number, order and currency",
          });
          return;
        }
        var loan = new Loan();
        loan.name = name;
        loan.accountType = accountType;
        loan.accountNumber = accountNumber;
        loan.details = details;
        loan.order = order;
        loan.accountId = account.id;
        loan.currency = currency;
        loan.outstandingPrincipal = loanAmount;
        loan.paidTillNow = 0;
        loan.loanAmount = loanAmount;
        loan.save(function (err) {
          if (err) {
            console.log(err);
            res.status(500).json({ message: "Something has gone wrong!" });
          }

          loan = loan.toJSON();
          loan.outstandingPrincipal = Number(loan.outstandingPrincipal);
          loan.paidTillNow = Number(loan.paidTillNow);
          loan.loanAmount = Number(loan.loanAmount);
          res.json({ message: "Loan account added", loan: loan });
        });
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var id = req.params.loanId;
        var name = req.body.name;
        var accountType = req.body.accountType;
        var accountNumber = req.body.accountNumber;
        var details = req.body.details;
        if (name == null || accountType == null || accountNumber == null) {
          res.status(412).json({
            success: false,
            message:
              "Please specify loan name, account type and account number",
          });
          return;
        }

        Loan.findOne(
          {
            accountId: account.id,
            _id: new ObjectId(id),
          },
          function (err, loan) {
            if (err) {
              res.send(err);
              return;
            }

            loan.name = name;
            loan.accountType = accountType;
            loan.accountNumber = accountNumber;
            loan.details = details;
            loan.save(function (err) {
              if (err) {
                console.log(err);
                res.status(500).json({
                  success: false,
                  message: "Something has gone wrong!",
                });
              }

              loan = loan.toJSON();
              loan.outstandingPrincipal = Number(loan.outstandingPrincipal);
              loan.paidTillNow = Number(loan.paidTillNow);
              loan.loanAmount = Number(loan.loanAmount);
              res.json({
                success: true,
                message: "Loan account updated",
                loan: loan,
              });
            });
          }
        );
      });
    })
    .delete(function (req, res) {
      var loanId = req.params.loanId;
      findItemsForThisAccount(req, res, function (account) {
        Loan.remove(
          {
            _id: new ObjectId(loanId),
            accountId: account.id,
          },
          function (err) {
            if (err) {
              console.log(err);
              res
                .status(500)
                .json({ message: "Something has gone wrong!", success: false });
            }
            res.json({ success: true, message: "Loan deleted" });
          }
        );
      });
    });

  apiRouter
    .route("/loan-transactions")
    .get(function (req, res) {
      var startDate = req.query.startdate;
      var endDate = req.query.enddate;
      var loanId = req.query.loanId;
      if (startDate == null || endDate == null) {
        res.status(400);
        res.send({
          message: "Please send startdate and enddate query parameters",
        });
        return;
      }

      findItemsForThisAccount(req, res, function (account) {
        startDate = Number(startDate);
        endDate = Number(endDate);
        var query = {
          accountId: account.id,
          date: { $gte: startDate, $lte: endDate },
        };
        if (loanId) {
          query["loanId"] = new ObjectId(loanId);
        }

        LoanTransaction.find(query, function (err, loanTransactions) {
          if (err) {
            res.send(err);
            return;
          }

          var result = [];
          loanTransactions.forEach(function (t) {
            t = t.toJSON();
            t.transactionType = getLoanTransactionTypeStringFromNumber(
              t.transactionType
            );
            t.amount = Number(t.amount);
            t.paidTillNow = Number(t.paidTillNow);
            result.push(t);
          });

          res.json(result);
        });
      });
    })
    .put(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        var date = req.body.date;
        var loanId = req.body.loanId;
        var currency = req.body.currency;

        if (date == null) {
          res.status(412).json({
            message: "Please specify new date for Given received instance",
          });
        }

        if (loanId == null) {
          res.status(412).json({ message: "Please specify loan id" });
        }

        LoanTransaction.remove(
          {
            accountId: account.id,
            date: date,
            loanId: new ObjectId(loanId),
          },
          function (removeError) {
            if (removeError) {
              console.log(removeError);
              res.status(500).json({ message: "Something has gone wrong!" });
            }

            var promisesToAddTransactions = [];
            var result = {
              date: Number(date),
              currency: currency,
              loanId: loanId,
              transactions: [],
            };

            var transactionsInReq = req.body.transactions;
            transactionsInReq.forEach(function (t) {
              var trans = new LoanTransaction();
              trans.accountId = account.id;
              trans.loanId = loanId;
              trans.amount = t.amount;
              trans.paidTillNow = 0;
              trans.date = date;
              trans.remark = t.remark;
              trans.transactionType = getLoanTransactionTypeNumberFromString(
                t.transactionType || "disbursement"
              ); // 0 - disbursement, 1 - payment, 2 - outstanding-principal
              trans.order = t.order;

              result.transactions.push(trans);
              promisesToAddTransactions.push(trans.save());
            });

            Promise.all(promisesToAddTransactions).then(function () {
              //get all transactiosn for this account and update paidTillNow from startdate onwards
              LoanTransaction.find(
                {
                  accountId: account.id,
                  loanId: new ObjectId(loanId),
                },
                function (err, allTransactions) {
                  if (err) {
                    res.send(err);
                    return;
                  }

                  allTransactions = _.sortBy(allTransactions, function (t) {
                    return t.date;
                  });

                  var promisesToUpdateBalance = [];
                  var paidTillNow = 0,
                    outstandingBalance = 0;
                  for (var i = 0, tran; (tran = allTransactions[i]); i++) {
                    var transactionAmount = Number(tran.amount);
                    if (tran.date < date) {
                      paidTillNow = Number(tran.paidTillNow);

                      if (tran.transactionType === 2) {
                        outstandingBalance = transactionAmount;
                      }
                      continue;
                    }

                    switch (tran.transactionType) {
                      case 0: // debit
                        paidTillNow -= transactionAmount;
                        break;
                      case 1: // credit
                        paidTillNow += transactionAmount;
                        break;
                      case 2: // principal outstanding
                        tran.outstandingBalance = transactionAmount;
                        outstandingBalance = transactionAmount;
                        break;
                    }
                    tran.paidTillNow = paidTillNow;
                    promisesToUpdateBalance.push(tran.save());
                  }

                  Loan.findOne(
                    {
                      accountId: account.id,
                      _id: new ObjectId(loanId),
                    },
                    function (loanError, loan) {
                      if (loanError) {
                        console.log(loanError);
                        res
                          .status(500)
                          .json({ message: "Something has gone wrong!" });
                      }

                      loan.paidTillNow = paidTillNow;
                      if (outstandingBalance > 0) {
                        loan.outstandingPrincipal = outstandingBalance;
                      }
                      promisesToUpdateBalance.push(loan.save());
                    }
                  );

                  Promise.all(promisesToUpdateBalance).then(function () {
                    LoanTransaction.find(
                      {
                        accountId: account.id,
                        loanId: new ObjectId(loanId),
                        date: date,
                      },
                      function (err, loanTransactions) {
                        if (err) {
                          res.send(err);
                          return;
                        }

                        var updatedTransactions = [];
                        loanTransactions.forEach(function (t) {
                          t = t.toJSON();
                          t.transactionType =
                            getLoanTransactionTypeStringFromNumber(
                              t.transactionType
                            );
                          t.amount = Number(t.amount);
                          t.paidTillNow = Number(t.paidTillNow);
                          updatedTransactions.push(t);
                        });
                        result.transactions = updatedTransactions;

                        res.json({
                          message: "Loan Transactions updated",
                          loanTransactions: result,
                        });
                      }
                    );
                  });
                }
              );
            });
          }
        );
      });
    });

  apiRouter
    .route("/stats/total-planned-amount-workitemwise")
    .get(function (req, res) {
      var startMonth = req.query.startmonth;
      var endMonth = req.query.endmonth;
      if (startMonth == null || endMonth == null) {
        res.status(400);
        res.send({
          message: "Please send startmonth and endmonth query parameters",
        });
        return;
      }
      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            startMonth = Number(startMonth);
            endMonth = Number(endMonth);

            WorkitemPlan.find({
              accountId: account.id,
              month: { $gte: startMonth, $lte: endMonth },
            })
              .populate("workitemId")
              .exec(function (err, workitemPlans) {
                if (err) {
                  res.send(err);
                  return;
                }
                var result = [];
                workitemPlans.forEach(function (wip) {
                  var amount = 0;
                  wip.lineitems.forEach(function (li) {
                    if (li.currency === userSettings.currency) {
                      amount += Number(li.amount);
                    }
                  });
                  wip.amount = amount;

                  var wiFound = false;
                  for (var i = 0, wi; (wi = result[i]); i++) {
                    if (wi.workitemId == wip.workitemId.id.toString()) {
                      wi.totalPlannedAmount =
                        wi.totalPlannedAmount + wip.amount;
                      wiFound = true;
                      break;
                    }
                  }
                  if (!wiFound) {
                    result.push({
                      workitem: wip.workitemId,
                      totalPlannedAmount: wip.amount,
                    });
                  }
                });
                res.json(result);
              });
          }
        );
      });
    });

  apiRouter
    .route("/stats/total-actual-amount-workitemwise")
    .get(function (req, res) {
      var startDate = req.query.startdate;
      var endDate = req.query.enddate;
      if (startDate == null || endDate == null) {
        res.status(400);
        res.send({
          message: "Please send startdate and enddate query parameters",
        });
        return;
      }
      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            startDate = Number(startDate);
            endDate = Number(endDate);
            WorkitemInstance.find(
              {
                accountId: account.id,
                date: { $gte: startDate, $lte: endDate },
              },
              function (err, workiteInstances) {
                if (err) {
                  res.send(err);
                  return;
                }
                var result = [];
                workiteInstances.forEach(function (wii) {
                  var amount = 0;
                  wii.lineitems.forEach(function (li) {
                    if (li.currency === userSettings.currency) {
                      amount += Number(li.amount);
                    }
                  });
                  wii.amount = amount;

                  var wiFound = false;
                  for (var i = 0, wi; (wi = result[i]); i++) {
                    if (wi.workitemId == wii.workitemId.toString()) {
                      wi.totalActualAmount = wi.totalActualAmount + wii.amount;
                      wiFound = true;
                      break;
                    }
                  }
                  if (!wiFound) {
                    result.push({
                      workitemId: wii.workitemId,
                      totalActualAmount: wii.amount,
                    });
                  }
                });
                res.json(result);
              }
            );
          }
        );
      });
    });

  apiRouter
    .route("/stats/total-actual-amount-monthwise")
    .get(function (req, res) {
      var startMonth = req.query.startmonth;
      var endMonth = req.query.endmonth;
      var tags = req.query.tags ? req.query.tags.split(",") : [];
      var contacts = req.query.contacts ? req.query.contacts.split(",") : [];
      if (startMonth == null || endMonth == null) {
        res.status(400);
        res.send({
          message: "Please send startmonth and endmonth query parameters",
        });
        return;
      }
      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            var startDate = getDateStringFromMonthString(startMonth);
            var endDate = getDateStringFromMonthString(endMonth, "end");
            WorkitemInstance.find({
              accountId: account.id,
              date: { $gte: startDate, $lte: endDate },
            })
              .populate("workitemId")
              .exec(function (err, workiteInstances) {
                if (err) {
                  res.send(err);
                  return;
                }
                var result = [];
                var endDateObj = getDateFromString(endDate);
                var startDateObj = getDateFromString(startDate);
                for (var d = startDateObj; d < endDateObj; d = nextMonth(d)) {
                  var thisMonthStats = {
                    month: getMonthStringFromDate(d),
                    totalActualIncome: 0,
                    totalActualExpense: 0,
                  };

                  workiteInstances.forEach(function (wii) {
                    var amount = 0;
                    wii.lineitems.forEach(function (li) {
                      if (
                        li.currency === userSettings.currency &&
                        (tags.length === 0 ||
                          _.intersection(tags, li.tags).length > 0) &&
                        (contacts.length === 0 ||
                          _.intersection(
                            contacts,
                            _.map(li.contacts, function (c) {
                              return c._id;
                            })
                          ).length > 0)
                      ) {
                        amount += Number(li.amount);
                      }
                    });
                    wii.amount = amount;

                    var lastDateOfMonth = new Date(
                      d.getFullYear(),
                      d.getMonth() + 1,
                      0
                    );
                    var wiiDate = getDateFromString(wii.date);
                    if (wiiDate >= d && wiiDate <= lastDateOfMonth) {
                      if (wii.workitemId.incomeOrExpense === "income") {
                        thisMonthStats.totalActualIncome =
                          thisMonthStats.totalActualIncome + wii.amount;
                      } else {
                        thisMonthStats.totalActualExpense =
                          thisMonthStats.totalActualExpense + wii.amount;
                      }
                    }
                  });
                  result.push(thisMonthStats);
                }
                res.json(result);
              });
          }
        );
      });
    });

  apiRouter
    .route("/stats/total-planned-amount-monthwise")
    .get(function (req, res) {
      var startMonth = req.query.startmonth;
      var endMonth = req.query.endmonth;
      var tags = req.query.tags ? req.query.tags.split(",") : [];
      var contacts = req.query.contacts ? req.query.contacts.split(",") : [];
      if (startMonth == null || endMonth == null) {
        res.status(400);
        res.send({
          message: "Please send startmonth and endmonth query parameters",
        });
        return;
      }
      findItemsForThisAccount(req, res, function (account) {
        UserSettings.findOne(
          {
            accountId: account.id,
          },
          function (error, userSettings) {
            startMonth = Number(startMonth);
            endMonth = Number(endMonth);
            WorkitemPlan.find({
              accountId: account.id,
              month: { $gte: startMonth, $lte: endMonth },
            })
              .populate("workitemId")
              .exec(function (err, workitePlans) {
                if (err) {
                  res.send(err);
                  return;
                }
                var result = [];
                var endDateObj = getDateFromMonthString(endMonth);
                var startDateObj = getDateFromMonthString(startMonth);
                for (
                  var m = startDateObj;
                  m <= endDateObj;
                  m.setMonth(m.getMonth() + 1)
                ) {
                  var monthString = getMonthStringFromDate(m);
                  var thisMonthStats = {
                    month: monthString,
                    totalPlannedIncome: 0,
                    totalPlannedExpenses: 0,
                  };

                  workitePlans.forEach(function (wip) {
                    if (wip.month === monthString) {
                      var amount = 0;
                      wip.lineitems.forEach(function (li) {
                        if (
                          li.currency === userSettings.currency &&
                          (tags.length === 0 ||
                            _.intersection(tags, li.tags).length > 0) &&
                          (contacts.length === 0 ||
                            _.intersection(
                              contacts,
                              _.map(li.contacts, function (c) {
                                return c._id;
                              })
                            ).length > 0)
                        ) {
                          amount += Number(li.amount);
                        }
                      });
                      wip.amount = amount;
                      if (wip.workitemId.incomeOrExpense === "income") {
                        thisMonthStats.totalPlannedIncome =
                          thisMonthStats.totalPlannedIncome + amount;
                      } else {
                        thisMonthStats.totalPlannedExpenses =
                          thisMonthStats.totalPlannedExpenses + amount;
                      }
                    }
                  });
                  result.push(thisMonthStats);
                }
                res.json(result);
              });
          }
        );
      });
    });

  apiRouter
    .route("/tags/:tagName*?")
    .get(function (req, res) {
      var searchString = req.query.searchstring || "";
      findItemsForThisAccount(req, res, function (account) {
        Tag.find(
          {
            accountId: account.id,
            name: { $regex: searchString, $options: "i" },
          },
          function (err, tags) {
            if (err) {
              console.log(err);
              res.status(500).json({ message: "Something has gone wrong!" });
            }

            tags = tags.sort(function (a, b) {
              return a.name.localeCompare(b.name, "en", {
                sensitivity: "base",
              });
            });
            res.json(tags);
          }
        );
      });
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        if (req.body.length) {
          var promises = [];
          var tags = [];
          var i = 0;
          req.body.forEach(function (tagName) {
            Tag.findOne(
              {
                accountId: account.id,
                name: tagName.toLowerCase(),
              },
              function (errExisting, existingTag) {
                if (errExisting) {
                  console.log(errExisting);
                  res
                    .status(500)
                    .json({ message: "Something has gone wrong!" });
                }

                if (!existingTag) {
                  var tagModel = new Tag();
                  tagModel.name = tagName.toLowerCase();
                  tagModel.displayName = tagName;
                  tagModel.accountId = account.id;
                  tags.push(tagModel);
                  i++;

                  if (i === req.body.length) {
                    tags.forEach(function (t) {
                      promises.push(t.save());
                    });
                    Promise.all(promises).then(function () {
                      res.json({
                        success: true,
                        message: "Tags created",
                        tags: tags,
                      });
                    });
                  }
                } else {
                  console.log(tagName + " tag already exits in DB");
                }
              }
            );
          });

          if (!tags.length) {
            res.json({
              success: false,
              message: "No new tags created",
              tags: [],
            });
          }
        } else {
          var tagName = req.body.name;
          Tag.findOne(
            {
              accountId: account.id,
              name: tagName.toLowerCase(),
            },
            function (errExisting, existingTag) {
              if (errExisting) {
                console.log(errExisting);
                res.status(500).json({ message: "Something has gone wrong!" });
              }

              if (!existingTag) {
                var tag = new Tag();
                tag.name = tagName.toLowerCase();
                tag.displayName = tagName;
                tag.accountId = account.id;
                tag.save(function (err) {
                  if (err) {
                    console.log(err);
                    res
                      .status(500)
                      .json({ message: "Something has gone wrong!" });
                  }
                  res.json({ success: true, message: "Tag created", tag: tag });
                });
              } else {
                console.log(tagName + " tag already exits in DB");
                res.json({
                  success: false,
                  message: "Tag already exists",
                  tag: existingTag,
                });
              }
            }
          );
        }
      });
    })
    .delete(function (req, res) {
      var tagName = req.params.tagName;
      findItemsForThisAccount(req, res, function (account) {
        Tag.remove(
          {
            name: tagName.toLowerCase(),
            accountId: account.id,
          },
          function (err) {
            if (err) {
              console.log(err);
              res.status(500).json({ message: "Something has gone wrong!" });
            }
            res.json({ success: true, message: "Tag deleted" });
          }
        );
      });
    });

  function createContact(
    account,
    firstName,
    lastName,
    email,
    mobile,
    photoUrl,
    req,
    res,
    cb,
    data
  ) {
    if (!firstName || firstName === "") {
      if (cb) {
        cb(req, res, account, null, data);
      }
      return;
    }

    var contact = new Contact();
    contact.accountId = account.id;
    contact.firstName = firstName;
    contact.lastName = lastName;
    contact.email = email;
    contact.mobile = mobile;
    contact.photoUrl = photoUrl;

    var onContactCreate = function (err, cnt) {
      if (err) {
        console.log(err);
        res.status(500).json({ message: "Something has gone wrong!" });
      }

      console.log("Contact created" + cnt);
      if (cb) {
        cb(req, res, account, cnt, data);
      }
    };
    contact.save(onContactCreate);
  }

  function createContactIfNotExist(
    contactId,
    account,
    firstName,
    lastName,
    email,
    mobile,
    photoUrl,
    req,
    res,
    cb,
    data
  ) {
    if (contactId == null) {
      createContact(
        account,
        firstName,
        lastName,
        email,
        mobile,
        photoUrl,
        req,
        res,
        cb,
        data
      );
    } else {
      Contact.findOne(
        { _id: new ObjectId(contactId) },
        function (err, contact) {
          if (err || contact == null) {
            //create new contact and associate with given-received
            console.log(err);

            console.log("Contact not found with id: " + contactId);
            createContact(
              account,
              firstName,
              lastName,
              email,
              mobile,
              photoUrl,
              req,
              res,
              cb,
              data
            );
          } else {
            console.log("Contact found: " + contact);
            if (cb) {
              cb(req, res, account, contact, data);
            }
          }
        }
      );
    }
  }

  apiRouter
    .route("/contacts/:contactId*?")
    .get(function (req, res) {
      var searchString = req.query.searchstring || "";
      if (searchString !== "") {
        findItemsForThisAccount(req, res, function (account) {
          Contact.find({
            accountId: account.id,
            $or: [
              { firstName: { $regex: searchString, $options: "i" } },
              { lastName: { $regex: searchString, $options: "i" } },
            ],
          })
            .sort({ firstName: 1, lastName: 1 })
            .exec(function (err, contacts) {
              if (err) {
                res.send(err);
                return;
              }
              res.json(contacts);
            });
        });
      } else {
        findItemsForThisAccount(req, res, function (account) {
          Contact.find({
            accountId: account.id,
          })
            .sort({ firstName: 1, lastName: 1 })
            .exec(function (err, contacts) {
              if (err) {
                res.send(err);
                return;
              }
              res.json(contacts);
            });
        });
      }
    })
    .post(function (req, res) {
      findItemsForThisAccount(req, res, function (account) {
        if (req.body.length) {
          var promises = [];
          var contacts = [];
          req.body.forEach(function (contact) {
            var contactModel = new Contact();
            contactModel.accountId = account.id;
            contactModel.firstName = contact.firstName || "";
            contactModel.lastName = contact.lastName || "";
            contactModel.email = contact.email || "";
            contactModel.mobile = contact.mobile || "";
            contactModel.photoUrl = contact.photoUrl || "";
            contacts.push(contactModel);

            promises.push(contactModel.save());
          });

          Promise.all(promises).then(function () {
            res.json({ message: "Contacts created", contacts: contacts });
          });
        } else {
          var firstName = req.body.firstName || "";
          var lastName = req.body.lastName || "";
          var email = req.body.email || "";
          var mobile = req.body.mobile || "";
          var photoUrl = req.body.photoUrl || "";

          createContact(
            account,
            firstName,
            lastName,
            email,
            mobile,
            photoUrl,
            req,
            res,
            function (req, res, account, contact) {
              res.json({ message: "Contact created", contact: contact });
            }
          );
        }
      });
    })
    .put(function (req, res) {
      var id = req.params.contactId;
      findItemsForThisAccount(req, res, function (account) {
        Contact.findOne(
          {
            _id: new ObjectId(id),
            accountId: account.id,
          },
          function (err, contact) {
            contact.accountId = account.id;
            contact.firstName = req.body.firstName || "";
            contact.lastName = req.body.lastName || "";
            contact.email = req.body.email || "";
            contact.photoUrl = req.body.photoUrl || "";
            contact.mobile = req.body.mobile || "";
            contact.save(function (err, cnt) {
              if (err) {
                console.log(err);
                res.status(500).json({ message: "Something has gone wrong!" });
              }
              res.json({ message: "Contact updated", contact: cnt });
            });
          }
        );
      });
    })
    .delete(function (req, res) {
      var id = req.params.contactId;
      findItemsForThisAccount(req, res, function (account) {
        Contact.remove(
          {
            _id: new ObjectId(id),
            accountId: account.id,
          },
          function (err) {
            if (err) {
              console.log(err);
              res.status(500).json({ message: "Something has gone wrong!" });
            }
            res.json({ message: "Contact deleted" });
          }
        );
      });
    });

  apiRouter.route("/upload-image").post(function (req, res) {
    var id = randomstring.generate(15);
    var imgType = req.body.imgType;
    var imgData = req.body.imgData;
    var filePath = req.body.fileUrl;

    findItemsForThisAccount(req, res, function (account) {
      if (!filePath) {
        var extension = "";
        switch (imgType) {
          case "image/jpeg":
            extension = ".jpg";
            break;
          case "image/gif":
            extension = ".gif";
            break;
          case "image/png":
            extension = ".png";
            break;
        }

        filePath = "data/" + account.id + "/" + id + extension;
      }

      var buf = new Buffer(
        imgData.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );
      var data = {
        Key: filePath,
        Body: buf,
        ContentEncoding: "base64",
        ContentType: imgType,
      };
      s3Bucket.putObject(data, function (err, data) {
        if (err) {
          console.log(err);
          console.log("Error uploading data: ", data);
          res.send(err);
          return;
        } else {
          console.log("succesfully uploaded the image!");
          res.json({ message: "File uploaded", url: filePath });
        }
      });
    });
  });

  apiRouter.route("/accounts").get(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      if (account.email === "souvikbasu@gmail.com") {
        Account.find({}, function (err, accounts) {
          if (err) {
            res.send(err);
            return;
          }
          accounts.forEach(function (account) {
            account.password = "";
          });
          res.json(accounts);
        });
      } else {
        res.status(403).json({ message: "Access denied" });
      }
    });
  });

  apiRouter.route("/invitees").get(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      if (account.email === "souvikbasu@gmail.com") {
        Invitee.find({}, function (err, invitees) {
          if (err) {
            res.send(err);
            return;
          }
          res.json(invitees);
        });
      } else {
        res.status(403).json({ message: "Access denied" });
      }
    });
  });

  var currencies = [
    { name: "US Dollar", symbol: "$", code: "USD", order: 0 },
    { name: "Euro", symbol: "€", code: "EUR", order: 1 },
    { name: "Indian Rupee", symbol: "&#x20b9;", code: "INR", order: 2 },
    { name: "Australian dollar", symbol: "$", code: "AUD", order: 3 },
    { name: "Pound", symbol: "&#xa3;", code: "GBP", order: 4 },
    { name: "Singapore dollar", symbol: "$", code: "SGD", order: 5 },
    { name: "Japanese yen", symbol: "¥", code: "JPY", order: 6 },
    { name: "Vanuatu vatu", symbol: "Vt", code: "VUV", order: 7 },
    { name: "Vietnamese đồng", symbol: "₫", code: "VND", order: 8 },
    { name: "Israeli new shekel", symbol: "₪", code: "ILS", order: 9 },
    { name: "Lao kip", symbol: "₭", code: "LAK", order: 10 },
    { name: "Macanese pataca", symbol: "P", code: "MOP", order: 11 },
    { name: "Omani rial", symbol: "ر.ع.", code: "OMR", order: 12 },
    { name: "Moldovan leu", symbol: "L", code: "MDL", order: 13 },
    { name: "Romanian leu", symbol: "lei", code: "RON", order: 14 },
    { name: "Gambian dalasi", symbol: "D", code: "GMD", order: 15 },
    { name: "East Caribbean dollar", symbol: "$", code: "XCD", order: 16 },
    { name: "Aruban florin", symbol: "ƒ", code: "AWG", order: 17 },
    { name: "Bahamian dollar", symbol: "$", code: "BSD", order: 18 },
    { name: "Barbadian dollar", symbol: "$", code: "BBD", order: 19 },
    { name: "Belize dollar", symbol: "$", code: "BZD", order: 20 },
    { name: "Bermudian dollar", symbol: "$", code: "BMD", order: 21 },
    { name: "Canadian dollar", symbol: "$", code: "CAD", order: 22 },
    { name: "Cayman Islands dollar", symbol: "$", code: "KYD", order: 23 },
    { name: "New Zealand dollar", symbol: "$", code: "NZD", order: 24 },
    {
      name: "Netherlands Antillean guilder",
      symbol: "ƒ",
      code: "ANG",
      order: 25,
    },
    { name: "Eritrean nakfa", symbol: "Nfk", code: "ERN", order: 26 },
    { name: "Fijian dollar", symbol: "$", code: "FJD", order: 27 },
    { name: "Guyanese dollar", symbol: "$", code: "GYD", order: 28 },
    { name: "Hong Kong dollar", symbol: "$", code: "HKD", order: 29 },
    { name: "Jamaican dollar", symbol: "$", code: "JMD", order: 30 },
    { name: "Kenyan shilling", symbol: "Sh", code: "KES", order: 31 },
    { name: "South African rand", symbol: "R", code: "ZAR", order: 32 },
    { name: "Liberian dollar", symbol: "$", code: "LRD", order: 33 },
    { name: "Mauritian rupee", symbol: "₨", code: "MUR", order: 34 },
    { name: "Namibian dollar", symbol: "$", code: "NAD", order: 35 },
    { name: "Seychellois rupee", symbol: "₨", code: "SCR", order: 36 },
    { name: "Sierra Leonean leone", symbol: "Le", code: "SLL", order: 37 },
    { name: "Solomon Islands dollar", symbol: "$", code: "SBD", order: 38 },
    { name: "Somali shilling", symbol: "Sh", code: "SOS", order: 39 },
    { name: "Sri Lankan rupee", symbol: "Rs", code: "LKR", order: 40 },
    { name: "Surinamese dollar", symbol: "$", code: "SRD", order: 41 },
    { name: "Swazi lilangeni", symbol: "L", code: "SZL", order: 42 },
    { name: "New Taiwan dollar", symbol: "$", code: "TWD", order: 43 },
    { name: "Tanzanian shilling", symbol: "Sh", code: "TZS", order: 44 },
    { name: "Trinidad and Tobago dollar", symbol: "$", code: "TTD", order: 45 },
    { name: "Ugandan shilling", symbol: "Sh", code: "UGX", order: 46 },
    { name: "Argentine peso", symbol: "$", code: "ARS", order: 47 },
    { name: "Bolivian boliviano", symbol: "Bs.", code: "BOB", order: 48 },
    { name: "Brazilian real", symbol: "R$", code: "BRL", order: 49 },
    { name: "Cape Verdean escudo", symbol: "Esc", code: "CVE", order: 50 },
    { name: "Chilean peso", symbol: "$", code: "CLP", order: 51 },
    { name: "Colombian peso", symbol: "$", code: "COP", order: 52 },
    { name: "Cuban convertible peso", symbol: "$", code: "CUC", order: 53 },
    { name: "Cuban peso", symbol: "$", code: "CUP", order: 54 },
    { name: "Dominican peso", symbol: "$", code: "DOP", order: 55 },
    { name: "Guatemalan quetzal", symbol: "Q", code: "GTQ", order: 56 },
    { name: "Honduran lempira", symbol: "L", code: "HNL", order: 57 },
    { name: "Mexican peso", symbol: "$", code: "MXN", order: 58 },
    { name: "Mozambican metical", symbol: "MT", code: "MZN", order: 59 },
    { name: "Nicaraguan córdoba", symbol: "C$", code: "NIO", order: 60 },
    { name: "Philippine peso", symbol: "₱", code: "PHP", order: 61 },
    { name: "Panamanian balboa", symbol: "B/.", code: "PAB", order: 62 },
    { name: "Uruguayan peso", symbol: "$", code: "UYU", order: 63 },
    { name: "West African CFA franc", symbol: "Fr", code: "XOF", order: 64 },
    { name: "Burundian franc", symbol: "Fr", code: "BIF", order: 65 },
    { name: "Central African CFA franc", symbol: "Fr", code: "XAF", order: 66 },
    { name: "Comorian franc", symbol: "Fr", code: "KMF", order: 67 },
    { name: "Congolese franc", symbol: "Fr", code: "CDF", order: 68 },
    { name: "Djiboutian franc", symbol: "Fr", code: "DJF", order: 69 },
    { name: "CFP franc", symbol: "Fr", code: "XPF", order: 70 },
    { name: "Guinean franc", symbol: "Fr", code: "GNF", order: 71 },
    { name: "Haitian gourde", symbol: "G", code: "HTG", order: 72 },
    { name: "Moroccan dirham", symbol: "د.م.", code: "MAD", order: 73 },
    { name: "Rwandan franc", symbol: "Fr", code: "RWF", order: 74 },
    { name: "Costa Rican colón", symbol: "₡", code: "CRC", order: 75 },
    { name: "Paraguayan guaraní", symbol: "₲", code: "PYG", order: 76 },
    { name: "Peruvian nuevo sol", symbol: "S/.", code: "PEN", order: 77 },
    { name: "Venezuelan bolívar", symbol: "Bs F", code: "VEF", order: 78 },
    { name: "Angolan kwanza", symbol: "Kz", code: "AOA", order: 79 },
    {
      name: "São Tomé and Príncipe dobra",
      symbol: "Db",
      code: "STD",
      order: 80,
    },
    { name: "Bhutanese ngultrum", symbol: "Nu.", code: "BTN", order: 81 },
    { name: "North Korean won", symbol: "₩", code: "KPW", order: 82 },
    { name: "Macedonian denar", symbol: "ден", code: "MKD", order: 83 },
    { name: "Iranian rial", symbol: "﷼", code: "IRR", order: 84 },
    { name: "Tajikistani somoni", symbol: "ЅМ", code: "TJS", order: 85 },
    { name: "Libyan dinar", symbol: "ل.د", code: "LYD", order: 86 },
    { name: "Qatari riyal", symbol: "ر.ق", code: "QAR", order: 87 },
    { name: "Icelandic króna", symbol: "kr", code: "ISK", order: 88 },
    { name: "Chinese yuan", symbol: "¥", code: "CNY", order: 89 },
    {
      name: "Bosnia and Herzegovina convertible mark",
      symbol: "KM",
      code: "BAM",
      order: 90,
    },
    { name: "Hungarian forint", symbol: "Ft", code: "HUF", order: 91 },
    { name: "Bahraini dinar", symbol: ".د.ب", code: "BHD", order: 92 },
    { name: "Iraqi dinar", symbol: "ع.د", code: "IQD", order: 93 },
    { name: "Kuwaiti dinar", symbol: "د.ك", code: "KWD", order: 94 },
    {
      name: "United Arab Emirates dirham",
      symbol: "د.إ",
      code: "AED",
      order: 95,
    },
    { name: "Yemeni rial", symbol: "﷼", code: "YER", order: 96 },
    { name: "Polish złoty", symbol: "zł", code: "PLN", order: 97 },
    { name: "Saudi riyal", symbol: "ر.س", code: "SAR", order: 98 },
    { name: "Czech koruna", symbol: "Kč", code: "CZK", order: 99 },
    { name: "Malagasy ariary", symbol: "Ar", code: "MGA", order: 100 },
    { name: "South Korean won", symbol: "₩", code: "KRW", order: 101 },
    { name: "Belarusian ruble", symbol: "Br", code: "BYR", order: 102 },
    { name: "Mauritanian ouguiya", symbol: "UM", code: "MRO", order: 103 },
    { name: "Nigerian naira", symbol: "₦", code: "NGN", order: 104 },
    { name: "Russian ruble", symbol: "RUB", code: "RUB", order: 105 },
    { name: "Transnistrian ruble", symbol: "р.", code: "PRB[F]", order: 106 },
    { name: "Ukrainian hryvnia", symbol: "₴", code: "UAH", order: 107 },
    {
      name: "Turkish lira",
      symbol: "Turkish lira symbol black.svg",
      code: "TRY",
      order: 108,
    },
    { name: "Maldivian rufiyaa", symbol: ".ރ", code: "MVR", order: 109 },
    { name: "Croatian kuna", symbol: "kn", code: "HRK", order: 110 },
    {
      name: "Armenian dram",
      symbol: "Armenian dram sign.svg",
      code: "AMD",
      order: 111,
    },
    { name: "Tunisian dinar", symbol: "د.ت", code: "TND", order: 112 },
    { name: "Mongolian tögrög", symbol: "₮", code: "MNT", order: 113 },
    { name: "Zambian kwacha", symbol: "ZK", code: "ZMW", order: 114 },
    { name: "Swedish krona", symbol: "kr", code: "SEK", order: 115 },
    { name: "Danish krone", symbol: "kr", code: "DKK", order: 116 },
    { name: "Norwegian krone", symbol: "kr", code: "NOK", order: 117 },
    { name: "Bangladeshi taka", symbol: "৳", code: "BDT", order: 118 },
    { name: "Nepalese rupee", symbol: "₨", code: "NPR", order: 119 },
    { name: "Pakistani rupee", symbol: "₨", code: "PKR", order: 120 },
    { name: "Serbian dinar", symbol: "дин.", code: "RSD", order: 121 },
    { name: "Guernsey pound", symbol: "£", code: "GGP[F]", order: 122 },
    { name: "Saint Helena pound", symbol: "£", code: "SHP", order: 123 },
    { name: "Falkland Islands pound", symbol: "£", code: "FKP", order: 124 },
    { name: "Gibraltar pound", symbol: "£", code: "GIP", order: 125 },
    { name: "Manx pound", symbol: "£", code: "IMP[F]", order: 126 },
    { name: "Jersey pound", symbol: "£", code: "JEP[F]", order: 127 },
    { name: "Ghana cedi", symbol: "₵", code: "GHS", order: 128 },
    { name: "Lebanese pound", symbol: "ل.ل", code: "LBP", order: 129 },
    { name: "South Sudanese pound", symbol: "£", code: "SSP", order: 130 },
    { name: "Sudanese pound", symbol: "ج.س.", code: "SDG", order: 131 },
    { name: "Syrian pound", symbol: "£", code: "SYP", order: 132 },
    { name: "Egyptian pound", symbol: "£", code: "EGP", order: 133 },
    { name: "Jordanian dinar", symbol: "د.ا", code: "JOD", order: 134 },
    { name: "Afghan afghani", symbol: "؋", code: "AFN", order: 135 },
    { name: "Burmese kyat", symbol: "Ks", code: "MMK", order: 136 },
    {
      name: "Azerbaijani manat",
      symbol: "Azeri manat symbol.svg",
      code: "AZN",
      order: 137,
    },
    { name: "Albanian lek", symbol: "L", code: "ALL", order: 138 },
    { name: "Swiss franc", symbol: "Fr", code: "CHF", order: 139 },
    { name: "Algerian dinar", symbol: "د.ج", code: "DZD", order: 140 },
    { name: "Ethiopian birr", symbol: "Br", code: "ETB", order: 141 },
    { name: "Thai baht", symbol: "฿", code: "THB", order: 142 },
    { name: "Brunei dollar", symbol: "$", code: "BND", order: 143 },
    { name: "Cambodian riel", symbol: "៛", code: "KHR", order: 144 },
    { name: "Indonesian rupiah", symbol: "Rp", code: "IDR", order: 145 },
    { name: "Malaysian ringgit", symbol: "RM", code: "MYR", order: 146 },
    { name: "Samoan tālā", symbol: "T", code: "WST", order: 147 },
    { name: "Tongan paʻanga[O]", symbol: "T$", code: "TOP", order: 148 },
    { name: "Lesotho loti", symbol: "L", code: "LSL", order: 149 },
    { name: "Bulgarian lev", symbol: "лв", code: "BGN", order: 150 },
    { name: "Malawian kwacha", symbol: "MK", code: "MWK", order: 151 },
    { name: "Turkmenistan manat", symbol: "m", code: "TMT", order: 152 },
    { name: "Georgian lari", symbol: "ლ", code: "GEL", order: 153 },
    { name: "Botswana pula", symbol: "P", code: "BWP", order: 154 },
    {
      name: "Kazakhstani tenge",
      symbol: "Kazakhstani tenge symbol.svg",
      code: "KZT",
      order: 155,
    },
    {
      name: "Uzbekistani som",
      symbol: "Tenge symbol.svg",
      code: "UZS",
      order: 156,
    },
    { name: "Papua New Guinean kina", symbol: "K", code: "PGK", order: 157 },
    { name: "Kyrgyzstani som", symbol: "лв[K]", code: "KGS", order: 158 },
  ];

  apiRouter.route("/currencies").get(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      Currency.find({}, function (err, currencies) {
        if (err) {
          res.send(err);
          return;
        }
        res.json(currencies);
      });
    });
  });

  var countries = [
    { name: "United States", code: "us", currency: "USD", order: 0 },
    { name: "United Kingdom", code: "gb", currency: "GBP", order: 1 },
    { name: "India", code: "in", currency: "INR", order: 2 },
    { name: "Australia", code: "au", currency: "AUD", order: 3 },
    { name: "Singapore", code: "sg", currency: "SGD", order: 4 },
    { name: "Afghanistan", code: "af", currency: "AFN", order: 5 },
    { name: "Albania", code: "al", currency: "ALL", order: 6 },
    { name: "Algeria", code: "dz", currency: "DZD", order: 7 },
    { name: "American Samoa", code: "as", currency: "WST", order: 8 },
    { name: "Andorra", code: "ad", currency: "EUR", order: 9 },
    { name: "Angola", code: "ao", currency: "AOA", order: 10 },
    { name: "Anguilla", code: "ai", currency: "XCD", order: 11 },
    { name: "Antigua and Barbuda", code: "ag", currency: "XCD", order: 12 },
    { name: "Argentina", code: "ar", currency: "ARS", order: 13 },
    { name: "Armenia", code: "am", currency: "AMD", order: 14 },
    { name: "Aruba", code: "aw", currency: "AWG", order: 15 },
    { name: "Austria", code: "at", currency: "EUR", order: 16 },
    { name: "Azerbaijan", code: "az", currency: "AZN", order: 17 },
    { name: "Bahamas", code: "bs", currency: "BSD", order: 18 },
    { name: "Bahrain", code: "bh", currency: "BHD", order: 19 },
    { name: "Bangladesh", code: "bd", currency: "BDT", order: 20 },
    { name: "Barbados", code: "bb", currency: "BBD", order: 21 },
    { name: "Belarus", code: "by", currency: "BYR", order: 22 },
    { name: "Belgium", code: "be", currency: "EUR", order: 23 },
    { name: "Belize", code: "bz", currency: "BZD", order: 24 },
    { name: "Benin", code: "bj", currency: "XOF", order: 25 },
    { name: "Bermuda", code: "bm", currency: "BMD", order: 26 },
    { name: "Bhutan", code: "bt", currency: "BTN", order: 27 },
    { name: "Bolivia", code: "bo", currency: "BOB", order: 28 },
    { name: "Bosnia and Herzegovina", code: "ba", currency: "BAM", order: 29 },
    { name: "Botswana", code: "bw", currency: "BWP", order: 30 },
    { name: "Brazil", code: "br", currency: "BRL", order: 31 },
    { name: "British Virgin Islands", code: "vg", currency: "USD", order: 32 },
    { name: "Brunei Darussalam", code: "bn", currency: "BND", order: 33 },
    { name: "Bulgaria", code: "bg", currency: "BGN", order: 34 },
    { name: "Burkina Faso", code: "bf", currency: "XOF", order: 35 },
    { name: "Burundi", code: "bi", currency: "BIF", order: 36 },
    { name: "Cape Verde", code: "cv", currency: "CVE", order: 37 },
    { name: "Cambodia", code: "kh", currency: "KHR", order: 38 },
    { name: "Cameroon", code: "cm", currency: "XAF", order: 39 },
    { name: "Canada", code: "ca", currency: "CAD", order: 40 },
    { name: "Cayman Islands", code: "ky", currency: "KYD", order: 41 },
    {
      name: "Central African Republic",
      code: "cf",
      currency: "XAF",
      order: 42,
    },
    { name: "Chad", code: "td", currency: "XAF", order: 43 },
    { name: "Chile", code: "cl", currency: "CLP", order: 44 },
    { name: "China", code: "cn", currency: "CNY", order: 45 },
    { name: "Colombia", code: "co", currency: "COP", order: 46 },
    { name: "Comoros", code: "km", currency: "KMF", order: 47 },
    { name: "Congo", code: "cg", currency: "XAF", order: 48 },
    {
      name: "Congo (Democratic Republic of the Congo)",
      code: "cd",
      currency: "CDF",
      order: 49,
    },
    { name: "Cook Islands", code: "ck", currency: "NZD", order: 50 },
    { name: "Costa Rica", code: "cr", currency: "CRC", order: 51 },
    { name: "Côte d'Ivoire", code: "ci", currency: "XOF", order: 52 },
    { name: "Croatia", code: "hr", currency: "HRK", order: 53 },
    { name: "Cuba", code: "cu", currency: "CUC", order: 54 },
    { name: "Cyprus", code: "cy", currency: "EUR", order: 55 },
    { name: "Czech Republic", code: "cz", currency: "CZK", order: 56 },
    { name: "Denmark", code: "dk", currency: "DKK", order: 57 },
    { name: "Djibouti", code: "dj", currency: "DJF", order: 58 },
    { name: "Dominica", code: "dm", currency: "XCD", order: 59 },
    { name: "Dominican Republic", code: "do", currency: "DOP", order: 60 },
    { name: "Ecuador", code: "ec", currency: "USD", order: 61 },
    { name: "Egypt", code: "eg", currency: "EGP", order: 62 },
    { name: "El Salvador", code: "sv", currency: "USD", order: 63 },
    { name: "Equatorial Guinea", code: "gq", currency: "XAF", order: 64 },
    { name: "Eritrea", code: "er", currency: "ERN", order: 65 },
    { name: "Estonia", code: "ee", currency: "EUR", order: 66 },
    { name: "Ethiopia", code: "et", currency: "ETB", order: 67 },
    { name: "Faroe Islands", code: "fo", currency: "DKK", order: 68 },
    { name: "Fiji", code: "fj", currency: "FJD", order: 69 },
    { name: "Finland", code: "fi", currency: "EUR", order: 70 },
    { name: "France", code: "fr", currency: "EUR", order: 71 },
    { name: "French Polynesia", code: "pf", currency: "XPF", order: 72 },
    { name: "Gabon", code: "ga", currency: "XAF", order: 73 },
    { name: "Gambia", code: "gm", currency: "GMD", order: 74 },
    { name: "Georgia", code: "ge", currency: "GEL", order: 75 },
    { name: "Germany", code: "de", currency: "EUR", order: 76 },
    { name: "Ghana", code: "gh", currency: "GHS", order: 77 },
    { name: "Gibraltar", code: "gi", currency: "GIP", order: 78 },
    { name: "Greece", code: "gr", currency: "EUR", order: 79 },
    { name: "Greenland", code: "gl", currency: "USD", order: 80 },
    { name: "Grenada", code: "gd", currency: "XCD", order: 81 },
    { name: "Guadeloupe", code: "gp", currency: "USD", order: 82 },
    { name: "Guam", code: "gu", currency: "USD", order: 83 },
    { name: "Guatemala", code: "gt", currency: "GTQ", order: 84 },
    { name: "Guernsey", code: "gg", currency: "GBP", order: 85 },
    { name: "Guinea", code: "gn", currency: "GNF", order: 86 },
    { name: "Guinea-Bissau", code: "gw", currency: "XOF", order: 87 },
    { name: "Guyana", code: "gy", currency: "GYD", order: 88 },
    { name: "Haiti", code: "ht", currency: "HTG", order: 89 },
    { name: "Holy See", code: "va", currency: "USD", order: 90 },
    { name: "Honduras", code: "hn", currency: "HNL", order: 91 },
    { name: "Hong Kong", code: "hk", currency: "HKD", order: 92 },
    { name: "Hungary", code: "hu", currency: "HUF", order: 93 },
    { name: "Iceland", code: "is", currency: "ISK", order: 94 },
    { name: "Indonesia", code: "id", currency: "IDR", order: 95 },
    { name: "Iran", code: "ir", currency: "IRR", order: 96 },
    { name: "Iraq", code: "iq", currency: "USD", order: 97 },
    { name: "Ireland", code: "ie", currency: "EUR", order: 98 },
    { name: "Isle of Man", code: "im", currency: "GBP", order: 99 },
    { name: "Israel", code: "il", currency: "ILS", order: 100 },
    { name: "Italy", code: "it", currency: "EUR", order: 101 },
    { name: "Jamaica", code: "jm", currency: "JMD", order: 102 },
    { name: "Japan", code: "jp", currency: "JPY", order: 103 },
    { name: "Jersey", code: "je", currency: "GBP", order: 104 },
    { name: "Jordan", code: "jo", currency: "JOD", order: 105 },
    { name: "Kazakhstan", code: "kz", currency: "KZT", order: 106 },
    { name: "Kenya", code: "ke", currency: "KES", order: 107 },
    { name: "Kiribati", code: "ki", currency: "AUD", order: 108 },
    { name: "Kosovo", code: "xk", currency: "EUR", order: 109 },
    { name: "Kuwait", code: "kw", currency: "KWD", order: 110 },
    { name: "Kyrgyzstan", code: "kg", currency: "KGS", order: 111 },
    { name: "Laos", code: "la", currency: "LAK", order: 112 },
    { name: "Latvia", code: "lv", currency: "EUR", order: 113 },
    { name: "Lebanon", code: "lb", currency: "LBP", order: 114 },
    { name: "Lesotho", code: "ls", currency: "LSL", order: 115 },
    { name: "Liberia", code: "lr", currency: "LRD", order: 116 },
    { name: "Libya", code: "ly", currency: "LYD", order: 117 },
    { name: "Liechtenstein", code: "li", currency: "CHF", order: 118 },
    { name: "Lithuania", code: "lt", currency: "EUR", order: 119 },
    { name: "Luxembourg", code: "lu", currency: "EUR", order: 120 },
    { name: "Macao", code: "mo", currency: "MOP", order: 121 },
    { name: "Macedonia", code: "mk", currency: "MKD", order: 122 },
    { name: "Madagascar", code: "mg", currency: "MGA", order: 123 },
    { name: "Malawi", code: "mw", currency: "MWK", order: 124 },
    { name: "Malaysia", code: "my", currency: "MYR", order: 125 },
    { name: "Maldives", code: "mv", currency: "MVR", order: 126 },
    { name: "Mali", code: "ml", currency: "XOF", order: 127 },
    { name: "Malta", code: "mt", currency: "EUR", order: 128 },
    { name: "Marshall Islands", code: "mh", currency: "USD", order: 129 },
    { name: "Martinique", code: "mq", currency: "USD", order: 130 },
    { name: "Mauritania", code: "mr", currency: "MRO", order: 131 },
    { name: "Mauritius", code: "mu", currency: "MUR", order: 132 },
    { name: "Mexico", code: "mx", currency: "MXN", order: 133 },
    { name: "Micronesia", code: "fm", currency: "USD", order: 134 },
    { name: "Moldova", code: "md", currency: "MDL", order: 135 },
    { name: "Monaco", code: "mc", currency: "EUR", order: 136 },
    { name: "Mongolia", code: "mn", currency: "MNT", order: 137 },
    { name: "Montenegro", code: "me", currency: "EUR", order: 138 },
    { name: "Montserrat", code: "ms", currency: "XCD", order: 139 },
    { name: "Morocco", code: "ma", currency: "MAD", order: 140 },
    { name: "Mozambique", code: "mz", currency: "MZN", order: 141 },
    { name: "Myanmar", code: "mm", currency: "MMK", order: 142 },
    { name: "Namibia", code: "na", currency: "NAD", order: 143 },
    { name: "Nauru", code: "nr", currency: "AUD", order: 144 },
    { name: "Nepal", code: "np", currency: "NPR", order: 145 },
    { name: "Netherlands", code: "nl", currency: "EUR", order: 146 },
    { name: "New Caledonia", code: "nc", currency: "XPF", order: 147 },
    { name: "New Zealand", code: "nz", currency: "NZD", order: 148 },
    { name: "Nicaragua", code: "ni", currency: "NIO", order: 149 },
    { name: "Niger", code: "ne", currency: "XOF", order: 150 },
    { name: "Nigeria", code: "ng", currency: "NGN", order: 151 },
    { name: "North Korea", code: "kp", currency: "KPW", order: 152 },
    { name: "Norway", code: "no", currency: "NOK", order: 153 },
    { name: "Oman", code: "om", currency: "OMR", order: 154 },
    { name: "Pakistan", code: "pk", currency: "PKR", order: 155 },
    { name: "Palau", code: "pw", currency: "USD", order: 156 },
    { name: "Palestine", code: "ps", currency: "ILS", order: 157 },
    { name: "Panama", code: "pa", currency: "PAB", order: 158 },
    { name: "Papua New Guinea", code: "pg", currency: "PGK", order: 159 },
    { name: "Paraguay", code: "py", currency: "PYG", order: 160 },
    { name: "Peru", code: "pe", currency: "PEN", order: 161 },
    { name: "Philippines", code: "ph", currency: "PHP", order: 162 },
    { name: "Poland", code: "pl", currency: "PLN", order: 163 },
    { name: "Portugal", code: "pt", currency: "EUR", order: 164 },
    { name: "Puerto Rico", code: "pr", currency: "USD", order: 165 },
    { name: "Qatar", code: "qa", currency: "QAR", order: 166 },
    { name: "Réunion", code: "re", currency: "USD", order: 167 },
    { name: "Romania", code: "ro", currency: "RON", order: 168 },
    { name: "Russia", code: "ru", currency: "RUB", order: 169 },
    { name: "Rwanda", code: "rw", currency: "RWF", order: 170 },
    { name: "Saint Kitts and Nevis", code: "kn", currency: "XCD", order: 171 },
    { name: "Saint Lucia", code: "lc", currency: "XCD", order: 172 },
    {
      name: "Saint Vincent and the Grenadines",
      code: "vc",
      currency: "XCD",
      order: 173,
    },
    { name: "Samoa", code: "ws", currency: "WST", order: 174 },
    { name: "San Marino", code: "sm", currency: "EUR", order: 175 },
    { name: "Sao Tome and Principe", code: "st", currency: "STD", order: 176 },
    { name: "Saudi Arabia", code: "sa", currency: "SAR", order: 177 },
    { name: "Senegal", code: "sn", currency: "XOF", order: 178 },
    { name: "Serbia", code: "rs", currency: "RSD", order: 179 },
    { name: "Seychelles", code: "sc", currency: "SCR", order: 180 },
    { name: "Sierra Leone", code: "sl", currency: "SLL", order: 181 },
    { name: "Slovakia", code: "sk", currency: "EUR", order: 182 },
    { name: "Slovenia", code: "si", currency: "EUR", order: 183 },
    { name: "Solomon Islands", code: "sb", currency: "SBD", order: 184 },
    { name: "Somalia", code: "so", currency: "SOS", order: 185 },
    { name: "South Africa", code: "za", currency: "ZAR", order: 186 },
    { name: "South Korea", code: "kr", currency: "KRW", order: 187 },
    { name: "South Sudan", code: "ss", currency: "SSP", order: 188 },
    { name: "Spain", code: "es", currency: "EUR", order: 189 },
    { name: "Sri Lanka", code: "lk", currency: "LKR", order: 190 },
    { name: "Sudan", code: "sd", currency: "SDG", order: 191 },
    { name: "Suriname", code: "sr", currency: "SRD", order: 192 },
    { name: "Swaziland", code: "sz", currency: "SZL", order: 193 },
    { name: "Sweden", code: "se", currency: "SEK", order: 194 },
    { name: "Switzerland", code: "ch", currency: "CHF", order: 195 },
    { name: "Syria", code: "sy", currency: "SYP", order: 196 },
    { name: "Taiwan", code: "tw", currency: "TWD", order: 197 },
    { name: "Tajikistan", code: "tj", currency: "TJS", order: 198 },
    { name: "Tanzania", code: "tz", currency: "TZS", order: 199 },
    { name: "Thailand", code: "th", currency: "THB", order: 200 },
    { name: "Timor-Leste", code: "tl", currency: "USD", order: 201 },
    { name: "Togo", code: "tg", currency: "XOF", order: 202 },
    { name: "Tonga", code: "to", currency: "TOP", order: 203 },
    { name: "Trinidad and Tobago", code: "tt", currency: "TTD", order: 204 },
    { name: "Tunisia", code: "tn", currency: "TND", order: 205 },
    { name: "Turkey", code: "tr", currency: "TRY", order: 206 },
    { name: "Turkmenistan", code: "tm", currency: "TMT", order: 207 },
    {
      name: "Turks and Caicos Islands",
      code: "tc",
      currency: "USD",
      order: 208,
    },
    { name: "Tuvalu", code: "tv", currency: "AUD", order: 209 },
    { name: "Uganda", code: "ug", currency: "UGX", order: 210 },
    { name: "Ukraine", code: "ua", currency: "UAH", order: 211 },
    { name: "United Arab Emirates", code: "ae", currency: "AED", order: 212 },
    { name: "Uruguay", code: "uy", currency: "UYU", order: 213 },
    { name: "Uzbekistan", code: "uz", currency: "UZS", order: 214 },
    { name: "Vanuatu", code: "vu", currency: "VUV", order: 215 },
    { name: "Venezuela", code: "ve", currency: "VEF", order: 216 },
    { name: "Vietnam", code: "vn", currency: "VND", order: 217 },
    {
      name: "United States Virgin Islands",
      code: "vi",
      currency: "USD",
      order: 218,
    },
    { name: "Western Sahara", code: "eh", currency: "USD", order: 219 },
    { name: "Yemen", code: "ye", currency: "YER", order: 220 },
    { name: "Zambia", code: "zm", currency: "ZMW", order: 221 },
    { name: "Zimbabwe", code: "zw", currency: "USD", order: 222 },
  ];

  apiRouter.route("/countries").get(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      Country.find({}, function (err, countries) {
        if (err) {
          res.send(err);
          return;
        }
        res.json(countries);
      });
    });
  });

  apiRouter.route("/cleanup").post(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      if (account.email === "souvikbasu@gmail.com") {
        Tag.remove({}, function (err) {
          console.log("All tags deleted");
        });
        WorkitemInstance.remove({}, function (err) {
          console.log("All workitem instances deleted");
        });
        WorkitemPlan.remove({}, function (err) {
          console.log("All workitem plans deleted");
        });
        Workitem.remove({}, function (err) {
          console.log("All workitems deleted");
        });

        CashAtHomeInstance.remove({}, function (err) {
          console.log("All cash at home instances deleted");
        });

        CashAtHomePlan.remove({}, function (err) {
          console.log("All cash at home plans deleted");
        });

        GivenReceivedInstance.remove({}, function (err) {
          console.log("All given received deleted");
        });

        Bank.remove({}, function (err) {
          console.log("All banks deleted");
        });

        BankTransaction.remove({}, function (err) {
          console.log("All bank trasactions deleted");
        });

        Investment.remove({}, function (err) {
          console.log("All investments deleted");
        });

        InvestmentTransaction.remove({}, function (err) {
          console.log("All investment trasactions deleted");
        });

        CreditCard.remove({}, function (err) {
          console.log("All credit cards deleted");
        });

        CreditCardTransaction.remove({}, function (err) {
          console.log("All credit card trasactions deleted");
        });

        Loan.remove({}, function (err) {
          console.log("All loans deleted");
        });

        LoanTransaction.remove({}, function (err) {
          console.log("All loan trasactions deleted");
        });

        Contact.remove({}, function (err) {
          console.log("All contacts deleted");
        });

        UserSettings.remove({}, function (err) {
          console.log("All user settings deleted");
        });

        Account.remove({}, function (err) {
          console.log("All accounts deleted");
        });

        Currency.remove({}, function (err) {
          console.log("All currencies deleted");

          currencies.forEach(function (currency) {
            var curr = new Currency();
            curr.name = currency.name;
            curr.code = currency.code;
            curr.symbol = currency.symbol;
            curr.order = currency.order;
            curr.save(function (err) {
              if (err) {
                res.send(err);
                return;
              }
              console.log("Currency " + currency.code + " created");
            });
          });
        });

        Country.remove({}, function (err) {
          console.log("All countries deleted");

          countries.forEach(function (country) {
            var curr = new Country();
            curr.name = country.name;
            curr.code = country.code;
            curr.currency = country.currency;
            curr.order = country.order;
            curr.save(function (err) {
              if (err) {
                res.send(err);
                return;
              }
              console.log("Country " + country.name + " created");
            });
          });
        });

        res.send({ message: "All clear" });
        return;
      } else {
        res.status(403).json({ message: "Access denied" });
      }
    });
  });

  apiRouter.route("/meta-cleanup").post(function (req, res) {
    findItemsForThisAccount(req, res, function (account) {
      if (account.email === "souvikbasu@gmail.com") {
        Currency.remove({}, function (err) {
          console.log("All currencies deleted");

          currencies.forEach(function (currency) {
            var curr = new Currency();
            curr.name = currency.name;
            curr.code = currency.code;
            curr.symbol = currency.symbol;
            curr.order = currency.order;
            curr.save(function (err) {
              if (err) {
                res.send(err);
                return;
              }
              console.log("Currency " + currency.code + " created");
            });
          });
        });

        Country.remove({}, function (err) {
          console.log("All countries deleted");

          countries.forEach(function (country) {
            var curr = new Country();
            curr.name = country.name;
            curr.code = country.code;
            curr.currency = country.currency;
            curr.order = country.order;
            curr.save(function (err) {
              if (err) {
                res.send(err);
                return;
              }
              console.log("Country " + country.name + " created");
            });
          });
        });

        res.send({ message: "All meta data refreshed" });
        return;
      } else {
        res.status(403).json({ message: "Access denied" });
      }
    });
  });

  apiRouter.route("/fixdb/:month/:accountId").post(function (req, res) {
    var month = req.params.month;
    var accountId = req.params.accountId;

    findItemsForThisAccount(req, res, function (account) {
      if (account.email === "souvikbasu@gmail.com") {
        WorkitemPlan.find(
          {
            month: month,
            accountId: new ObjectId(accountId),
          },
          function (err, workitemPlans) {
            workitemPlans.forEach(function (wip) {
              if (wip.lineitems.length === 0) {
                wip.remove();
              }
            });
          }
        );

        res.send({ message: "Done" });
        return;
      } else {
        res.status(403).json({ message: "Access denied" });
      }
    });
  });

  //////////////////////////////////////////////////////////////////////////////////////////////////
  // Utility methods

  function getDateFromString(dateString) {
    dateString = dateString.toString();
    return new Date(
      Number(dateString.substr(0, 4)),
      Number(dateString.substr(4, 2)) - 1,
      Number(dateString.substr(6, 2))
    );
  }

  function getStringFromDate(date) {
    return (
      date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
    );
  }

  function getDateFromMonthString(monthString, endOrBegining) {
    monthString = monthString.toString();
    endOrBegining = endOrBegining || "begining";
    if (endOrBegining === "end") {
      return new Date(
        Number(monthString.substr(0, 4)),
        Number(monthString.substr(4, 2)),
        0
      );
    } else {
      return new Date(
        Number(monthString.substr(0, 4)),
        Number(monthString.substr(4, 2)) - 1,
        1
      );
    }
  }

  function getMonthStringFromDate(date) {
    return date.getFullYear() * 100 + (date.getMonth() + 1);
  }

  function getDateStringFromMonthString(monthString, endOrBegining) {
    var date = getDateFromMonthString(monthString, endOrBegining);
    return getStringFromDate(date);
  }

  function getMonthStringFromDateString(dateString) {
    dateString = dateString.toString();
    return dateString.substr(0, 6);
  }

  function nextMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  function getActualOrPlannedStringFromNumber(actualOrPlanned) {
    return actualOrPlanned == 0 ? "actual" : "planned";
  }

  function getActualOrPlannedNumberFromString(actualOrPlanned) {
    return actualOrPlanned === "actual" ? 0 : 1;
  }

  function getGivenOrReceivedStringFromNumber(givenOrReceived) {
    return givenOrReceived == 0 ? "given" : "received";
  }

  function getGivenOrReceivedNumberFromString(givenOrReceived) {
    return givenOrReceived === "given" ? 0 : 1;
  }

  function getTransactionTypeStringFromNumber(transactionType) {
    switch (transactionType) {
      case 0:
        return "debit";
      case 1:
        return "credit";
      case 2:
        return "balance-carry-forward";
    }
  }

  function getTransactionTypeNumberFromString(transactionType) {
    switch (transactionType) {
      case "debit":
        return 0;
      case "credit":
        return 1;
      case "balance-carry-forward":
        return 2;
    }
  }

  function getInvestmentTransactionTypeStringFromNumber(transactionType) {
    switch (transactionType) {
      case 0:
        return "buy";
      case 1:
        return "sell";
      case 2:
        return "current-value";
    }
  }

  function getInvestmentTransactionTypeNumberFromString(transactionType) {
    switch (transactionType) {
      case "buy":
        return 0;
      case "sell":
        return 1;
      case "current-value":
        return 2;
    }
  }

  function getLoanTransactionTypeStringFromNumber(transactionType) {
    switch (transactionType) {
      case 0:
        return "disbursement";
      case 1:
        return "payment";
      case 2:
        return "outstanding-principal";
    }
  }

  function getLoanTransactionTypeNumberFromString(transactionType) {
    switch (transactionType) {
      case "disbursement":
        return 0;
      case "payment":
        return 1;
      case "outstanding-principal":
        return 2;
    }
  }

  function getCurrencySymbol(currencyCode) {
    switch (currencyCode) {
      case "USD":
        return "$";
      case "GBP":
        return String.fromCharCode(163);
      case "INR":
        return String.fromCharCode(8377);
      default:
        return currencyCode;
    }
  }

  function getRelevantTags(wip) {
    if (wip == null || wip.lineitems == null) {
      return [];
    }
    var allTags = _.flatten(_.map(wip.lineitems, "tags"));
    return allTags.filter(function (item, pos) {
      return allTags.indexOf(item) == pos;
    });
  }

  bankAccountTypes = {
    SAVINGS_BANK: 0,
    CURRENT_BANK: 1,
  };

  investmentTypes = {
    FIXED_DEPOSITS: 0,
    TAX_SAVING_SCHEMES: 1,
    PROVIDENT_FUND: 2,
    MUTUAL_FUNDS: 3,
    STOCKS: 4,
    BONDS: 5,
    FOREX: 6,
    GOLD_AND_PRECIOUS_METALS: 7,
    REAL_ESTATE: 8,
    ASSETS: 9,
    INSURANCE_POLICY: 10,
    OPTIONS: 11,
    FUTURES: 12,
    OTHERS: 13,
  };

  loanAccountTypes = {
    HOME_LOAN: 0,
    CAR_LOAN: 1,
    PERSONAL_LOAN: 2,
    OTHERS: 3,
  };

  return apiRouter;
};
