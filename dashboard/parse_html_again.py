# Let's write a python script to quickly extract the Date layout so we can mimic the component nicely.
import datetime
print(datetime.datetime.now().strftime("%A, %B %d, %Y"))
